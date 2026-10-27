"use strict";

import bcrypt from "bcryptjs";
import { Request } from "express";
import Admin from "../models/admin.model";
import { createTokenPair, verifyRefreshToken } from "../auth/authUtils";
import { AuthFailureError, ForbiddenError } from "../core/error.response";
import { AccountStatus, AuditResult } from "../types/enums";
import auditService from "./audit.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/**
 * Authenticate an admin and issue a token pair.
 *
 * Repeated failures lock the account for a while, so a stolen username cannot
 * be brute-forced. Both "unknown user" and "wrong password" return the same
 * message to avoid revealing which usernames exist.
 */
const login = async (username: string, password: string, req?: Request) => {
  const genericFailure = new AuthFailureError("Invalid username or password");

  const admin = await Admin.findOne({ username }).select("+passwordHash");
  if (!admin) {
    await auditService.recordFailure({
      action: "AUTH_LOGIN",
      targetType: "Admin",
      targetId: username,
      detail: { reason: "unknown username" },
      req,
    });
    throw genericFailure;
  }

  if (admin.status !== AccountStatus.ACTIVE) {
    await auditService.recordFailure({
      action: "AUTH_LOGIN",
      targetType: "Admin",
      targetId: username,
      detail: { reason: "account inactive" },
      req,
    });
    throw new ForbiddenError("Account is inactive");
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new ForbiddenError(
      `Account locked until ${admin.lockedUntil.toISOString()}`
    );
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    admin.failedLoginCount += 1;
    if (admin.failedLoginCount >= MAX_FAILED_LOGINS) {
      admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      admin.failedLoginCount = 0;
    }
    await admin.save();

    await auditService.recordFailure({
      action: "AUTH_LOGIN",
      targetType: "Admin",
      targetId: username,
      detail: { reason: "bad password", locked: !!admin.lockedUntil },
      req,
    });
    throw genericFailure;
  }

  admin.failedLoginCount = 0;
  admin.lockedUntil = undefined;
  admin.lastLoginAt = new Date();
  await admin.save();

  const tokens = createTokenPair({
    sub: admin._id.toString(),
    username: admin.username,
    role: admin.role,
  });

  await auditService.record({
    actor: { id: admin._id, username: admin.username, role: admin.role },
    action: "AUTH_LOGIN",
    targetType: "Admin",
    targetId: admin._id.toString(),
    result: AuditResult.SUCCESS,
    req,
  });

  return {
    tokens,
    admin: {
      id: admin._id,
      username: admin.username,
      fullName: admin.fullName,
      role: admin.role,
    },
  };
};

/** Exchange a refresh token for a fresh pair, re-reading the admin each time. */
const refresh = async (refreshToken: string) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AuthFailureError("Invalid refresh token");
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin || admin.status !== AccountStatus.ACTIVE) {
    throw new AuthFailureError("Account no longer active");
  }

  return createTokenPair({
    sub: admin._id.toString(),
    username: admin.username,
    role: admin.role,
  });
};

const logout = async (req?: Request) => {
  await auditService.record({
    actor: req?.actor,
    action: "AUTH_LOGOUT",
    targetType: "Admin",
    targetId: req?.actor?.id?.toString(),
    req,
  });
  return { ok: true };
};

const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

export default { login, refresh, logout, hashPassword };
