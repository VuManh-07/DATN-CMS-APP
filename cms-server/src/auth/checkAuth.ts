"use strict";

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./authUtils";
import { AuthFailureError, ForbiddenError } from "../core/error.response";
import { AdminRole } from "../types/enums";

/**
 * Verify the bearer token and attach the actor to the request.
 *
 * Unlike the original demo (where this middleware was commented out at the
 * router), every CMS route is mounted behind this.
 */
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AuthFailureError("Missing or malformed Authorization header");
  }

  try {
    const payload = verifyAccessToken(token);
    req.actor = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
    return next();
  } catch (err: any) {
    throw new AuthFailureError(
      err.name === "TokenExpiredError" ? "Token expired" : "Invalid token"
    );
  }
};

/**
 * Identify the caller when they offer a token, and let them through when
 * they do not.
 *
 * For routes the wallet app reaches without an account, but where an
 * operator's token still has to land in req.actor so the audit trail names
 * them instead of recording every session as anonymous.
 */
const authenticateOptional = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.headers.authorization) return next();
  try {
    return authenticate(req, res, next);
  } catch {
    // A bad token is treated as no token: the route is open either way.
    return next();
  }
};

/**
 * Restrict a route to the given roles. SUPER_ADMIN passes everything, so new
 * routes do not have to remember to list it.
 */
const requireRole =
  (...roles: AdminRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = req.actor?.role;
    if (!role) throw new AuthFailureError("Not authenticated");
    if (role === AdminRole.SUPER_ADMIN || roles.includes(role)) return next();
    throw new ForbiddenError(
      `Role ${role} is not permitted to perform this action`
    );
  };

/** Anyone who can change data. AUDITOR is deliberately excluded. */
const WRITE_ROLES = [AdminRole.ADMIN, AdminRole.OPERATOR];
/** Card-lifecycle operations an operator may run from the desktop app. */
const OPERATOR_ROLES = [AdminRole.ADMIN, AdminRole.OPERATOR];
/** Administrative data management. */
const ADMIN_ROLES = [AdminRole.ADMIN];

export {
  authenticate,
  authenticateOptional,
  requireRole,
  WRITE_ROLES,
  OPERATOR_ROLES,
  ADMIN_ROLES,
};
