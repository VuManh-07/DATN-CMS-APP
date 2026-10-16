"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { KeySetStatus, KeyDerivationMode } from "../types/enums";

const DOCUMENT_NAME = "KeySet";
const COLLECTION_NAME = "keysets";

/**
 * An SCP03 master key set (ENC / MAC / DEK).
 *
 * The three keys are stored only as `encryptedKeyBlob` — a single AES-256-GCM
 * ciphertext wrapped under the KEK (see services/keyWrap.ts). Plaintext key
 * material exists only transiently in memory while a session is being set up,
 * and must never be logged or returned over the API.
 */
export interface IKeySet extends Document {
  _id: Types.ObjectId;
  name: string;
  kvn: number;
  keyType: string;
  derivationMode: KeyDerivationMode;
  encryptedKeyBlob: string;
  status: KeySetStatus;
  description?: string;
  createdBy?: Types.ObjectId;
  deprecatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const keySetSchema = new Schema<IKeySet>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    kvn: { type: Number, required: true, default: 1 },
    keyType: { type: String, default: "AES-128" },
    derivationMode: {
      type: String,
      enum: Object.values(KeyDerivationMode),
      default: KeyDerivationMode.STATIC,
    },
    // `select: false` so a stray `find()` can never serialise the wrapped keys
    // into an API response by accident.
    encryptedKeyBlob: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: Object.values(KeySetStatus),
      default: KeySetStatus.ACTIVE,
      index: true,
    },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    deprecatedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTION_NAME }
);

export default model<IKeySet>(DOCUMENT_NAME, keySetSchema);
