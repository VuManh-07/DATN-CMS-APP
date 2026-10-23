"use strict";

import { Request } from "express";
import User from "../models/user.model";
import Card from "../models/card.model";
import {
  BadRequestError,
  ConflictRequestError,
  NotFoundError,
} from "../core/error.response";
import { AccountStatus } from "../types/enums";
import { Actor } from "../types/actor";
import auditService from "./audit.service";

export interface ListUsersQuery {
  q?: string;
  status?: AccountStatus;
  page?: number;
  limit?: number;
}

const list = async (query: ListUsersQuery) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Number(query.limit) || 25);

  const filter: Record<string, any> = {};
  if (query.status) filter.status = query.status;
  if (query.q) {
    // Escape so a user typing "." or "(" does not become a regex.
    const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [
      { fullName: rx },
      { email: rx },
      { phone: rx },
      { nationalId: rx },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

const create = async (payload: any, actor: Actor, req?: Request) => {
  if (!payload?.fullName) throw new BadRequestError("fullName is required");

  if (payload.nationalId) {
    const dup = await User.findOne({ nationalId: payload.nationalId });
    if (dup) {
      throw new ConflictRequestError(
        `A user with national id ${payload.nationalId} already exists`
      );
    }
  }

  const user = await User.create({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    nationalId: payload.nationalId,
    dateOfBirth: payload.dateOfBirth,
    address: payload.address,
    status: payload.status || AccountStatus.ACTIVE,
    createdBy: actor.id,
  });

  await auditService.record({
    actor,
    action: "USER_CREATE",
    targetType: "User",
    targetId: user._id.toString(),
    detail: { fullName: user.fullName },
    req,
  });

  return user;
};

/** A user plus every card ever issued to them, newest first. */
const findById = async (id: string) => {
  const user = await User.findById(id).lean();
  if (!user) throw new NotFoundError("User not found");

  const cards = await Card.find({ userId: id })
    .sort({ createdAt: -1 })
    .select("cardId csn state kvn issuedAt activatedAt revokedAt expiresAt")
    .lean();

  return { ...user, cards };
};

const update = async (
  id: string,
  payload: any,
  actor: Actor,
  req?: Request
) => {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User not found");

  const editable = [
    "fullName",
    "email",
    "phone",
    "nationalId",
    "dateOfBirth",
    "address",
    "status",
  ];
  const changed: Record<string, any> = {};
  editable.forEach((field) => {
    if (payload[field] !== undefined && payload[field] !== (user as any)[field]) {
      changed[field] = payload[field];
      (user as any)[field] = payload[field];
    }
  });

  await user.save();

  await auditService.record({
    actor,
    action: "USER_UPDATE",
    targetType: "User",
    targetId: id,
    detail: { changed: Object.keys(changed) },
    req,
  });

  return user;
};

export default { list, create, findById, update };
