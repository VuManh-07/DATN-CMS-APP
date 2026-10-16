"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { AdminRole, AuditResult } from "../types/enums";

const DOCUMENT_NAME = "AuditLog";
const COLLECTION_NAME = "auditlogs";

/**
 * Append-only audit trail. Written by services/audit.service.ts — in
 * particular every lifecycle transition writes one row here, so a state change
 * without a matching audit entry should be impossible.
 */
export interface IAuditLog extends Document {
  actorId?: Types.ObjectId;
  actorUsername?: string;
  actorRole?: AdminRole;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  result: AuditResult;
  detail?: Record<string, any>;
  at: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "Admin", index: true },
    actorUsername: { type: String },
    actorRole: { type: String, enum: Object.values(AdminRole) },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String, index: true },
    ip: { type: String },
    userAgent: { type: String },
    result: {
      type: String,
      enum: Object.values(AuditResult),
      default: AuditResult.SUCCESS,
      index: true,
    },
    detail: { type: Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: COLLECTION_NAME }
);

auditLogSchema.index({ at: -1 });

export default model<IAuditLog>(DOCUMENT_NAME, auditLogSchema);
