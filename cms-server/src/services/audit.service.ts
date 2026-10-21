"use strict";

import { Request } from "express";
import AuditLog from "../models/auditLog.model";
import { AuditResult } from "../types/enums";
import { Actor } from "../types/actor";

export interface AuditEntry {
  actor?: Actor | null;
  action: string;
  targetType?: string;
  targetId?: string;
  result?: AuditResult;
  detail?: Record<string, any>;
  req?: Request;
}

/** Pull caller IP / user-agent off the request, when one is available. */
const requestContext = (req?: Request) => {
  if (!req) return {};
  return {
    ip:
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"] as string,
  };
};

/**
 * Write one audit row.
 *
 * Auditing must never break the operation it is recording, so failures here
 * are logged and swallowed rather than thrown.
 */
const record = async (entry: AuditEntry) => {
  try {
    await AuditLog.create({
      actorId: entry.actor?.id,
      actorUsername: entry.actor?.username,
      actorRole: entry.actor?.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      result: entry.result || AuditResult.SUCCESS,
      detail: entry.detail,
      at: new Date(),
      ...requestContext(entry.req),
    });
  } catch (err: any) {
    console.error("[audit] failed to write audit log:", err.message, entry.action);
  }
};

const recordFailure = (entry: Omit<AuditEntry, "result">) =>
  record({ ...entry, result: AuditResult.FAILURE });

export interface AuditQuery {
  actorId?: string;
  action?: string;
  targetId?: string;
  result?: AuditResult;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const list = async (query: AuditQuery) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Number(query.limit) || 25);

  const filter: Record<string, any> = {};
  if (query.actorId) filter.actorId = query.actorId;
  if (query.action) filter.action = query.action;
  if (query.targetId) filter.targetId = query.targetId;
  if (query.result) filter.result = query.result;
  if (query.from || query.to) {
    filter.at = {};
    if (query.from) filter.at.$gte = new Date(query.from);
    if (query.to) filter.at.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export default { record, recordFailure, list };
