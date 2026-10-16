"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { CardState, AdminRole } from "../types/enums";

const DOCUMENT_NAME = "CardStateHistory";
const COLLECTION_NAME = "cardstatehistory";

/**
 * Append-only record of every lifecycle transition. Rows are never updated or
 * deleted — the timeline on a card's detail page is built from this collection.
 */
export interface ICardStateHistory extends Document {
  cardId: Types.ObjectId;
  fromState: CardState | null;
  toState: CardState;
  reason?: string;
  actorId?: Types.ObjectId;
  actorRole?: AdminRole;
  metadata?: Record<string, any>;
  at: Date;
}

const cardStateHistorySchema = new Schema<ICardStateHistory>(
  {
    cardId: {
      type: Schema.Types.ObjectId,
      ref: "Card",
      required: true,
      index: true,
    },
    fromState: { type: String, enum: [...Object.values(CardState), null] },
    toState: {
      type: String,
      enum: Object.values(CardState),
      required: true,
    },
    reason: { type: String },
    actorId: { type: Schema.Types.ObjectId, ref: "Admin" },
    actorRole: { type: String, enum: Object.values(AdminRole) },
    metadata: { type: Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: COLLECTION_NAME }
);

cardStateHistorySchema.index({ cardId: 1, at: -1 });

export default model<ICardStateHistory>(DOCUMENT_NAME, cardStateHistorySchema);
