"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { CardState } from "../types/enums";

const DOCUMENT_NAME = "Card";
const COLLECTION_NAME = "cards";

/**
 * One derived account as the wallet reports it after the holder sets the card
 * up. Public data only: an address and the public key it came from, never a
 * private key or the seed.
 */
export interface ICardAccount {
  /** Account slot on the chip, matching the applet's account index. */
  index: number;
  address: string;
  publicKey: string;
  name?: string;
}

export interface ICard extends Document {
  _id: Types.ObjectId;
  /** CMS-internal identifier, assigned at creation, stable for the card's life. */
  cardId: string;
  /** Card Serial Number read off the chip. Absent until the card is first seen. */
  csn?: string;
  userId?: Types.ObjectId;
  state: CardState;
  aid: string;
  appletVersion?: string;
  keySetId?: Types.ObjectId;
  /** Key version number currently on the card; incremented by key rotation. */
  kvn: number;
  batchId?: Types.ObjectId;
  /** Replacement chain: this card replaces / was replaced by another. */
  replacesCardId?: Types.ObjectId;
  replacedByCardId?: Types.ObjectId;
  personalizedAt?: Date;
  issuedAt?: Date;
  activatedAt?: Date;
  lockedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  lockReason?: string;
  revokeReason?: string;
  /** Mirror of the on-card PIN retry counter, for reporting only. */
  pinRetryCounter?: number;
  /**
   * Accounts derived on the chip, reported by the wallet when the holder
   * activates it. Lets an operator answer "which addresses does this card
   * hold?" without the card in front of them.
   */
  accounts?: ICardAccount[];
  /** When the wallet last reported its accounts. */
  accountsSyncedAt?: Date;
  lastPersonalizeError?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Sub-document: no _id, these rows are identified by their account index. */
const cardAccountSchema = new Schema<ICardAccount>(
  {
    index: { type: Number, required: true },
    address: { type: String, required: true, trim: true },
    publicKey: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
  },
  { _id: false }
);

const cardSchema = new Schema<ICard>(
  {
    cardId: { type: String, required: true, unique: true, trim: true },
    csn: { type: String, trim: true, uppercase: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    state: {
      type: String,
      enum: Object.values(CardState),
      default: CardState.CREATED,
      required: true,
      index: true,
    },
    aid: { type: String, required: true, default: "A00001020304" },
    appletVersion: { type: String },
    keySetId: { type: Schema.Types.ObjectId, ref: "KeySet" },
    kvn: { type: Number, default: 1 },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    replacesCardId: { type: Schema.Types.ObjectId, ref: "Card" },
    replacedByCardId: { type: Schema.Types.ObjectId, ref: "Card" },
    personalizedAt: { type: Date },
    issuedAt: { type: Date },
    activatedAt: { type: Date },
    lockedAt: { type: Date },
    revokedAt: { type: Date },
    expiresAt: { type: Date, index: true },
    lockReason: { type: String },
    revokeReason: { type: String },
    pinRetryCounter: { type: Number },
    // `default: undefined` so a card that never reported accounts has no
    // field at all, rather than an empty array that reads as "no accounts".
    accounts: { type: [cardAccountSchema], default: undefined },
    accountsSyncedAt: { type: Date },
    lastPersonalizeError: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true, collection: COLLECTION_NAME }
);

// A CSN identifies one physical chip, so it may appear on at most one card
// record — but blank cards have no CSN yet, hence the partial index.
cardSchema.index(
  { csn: 1 },
  { unique: true, partialFilterExpression: { csn: { $type: "string" } } }
);

export default model<ICard>(DOCUMENT_NAME, cardSchema);
