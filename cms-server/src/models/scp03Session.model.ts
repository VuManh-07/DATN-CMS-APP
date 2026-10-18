"use strict";

import { Schema, model, Document, Types } from "mongoose";

const DOCUMENT_NAME = "Scp03Session";
const COLLECTION_NAME = "scp03sessions";

/**
 * Summary of a finished SCP03 session, written for audit purposes only.
 *
 * The *live* session (session keys, MAC chaining value, counters) lives in
 * Redis via models/scp03.model.ts and never reaches Mongo — no key material
 * is persisted here.
 */
export interface IScp03Session extends Document {
  entityId: string;
  cardId?: Types.ObjectId;
  csn?: string;
  kvn?: number;
  keySetId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  startedAt: Date;
  /**
   * Set once the card's cryptogram verified, i.e. the moment this session
   * stops being "someone claimed a cardId" and becomes proof that the caller
   * physically holds that chip. Anything authorised by a session rather than
   * by a CMS role must check this, not `result === "OPEN"`.
   */
  authenticatedAt?: Date;
  endedAt?: Date;
  result: "OPEN" | "SUCCESS" | "FAILED" | "ABANDONED";
  apduCount: number;
  errorMessage?: string;
}

const scp03SessionSchema = new Schema<IScp03Session>(
  {
    entityId: { type: String, required: true, index: true },
    cardId: { type: Schema.Types.ObjectId, ref: "Card", index: true },
    csn: { type: String },
    kvn: { type: Number },
    keySetId: { type: Schema.Types.ObjectId, ref: "KeySet" },
    actorId: { type: Schema.Types.ObjectId, ref: "Admin" },
    startedAt: { type: Date, default: Date.now },
    authenticatedAt: { type: Date },
    endedAt: { type: Date },
    result: {
      type: String,
      enum: ["OPEN", "SUCCESS", "FAILED", "ABANDONED"],
      default: "OPEN",
    },
    apduCount: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { versionKey: false, collection: COLLECTION_NAME }
);

export default model<IScp03Session>(DOCUMENT_NAME, scp03SessionSchema);
