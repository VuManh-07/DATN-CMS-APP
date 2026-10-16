"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { AccountStatus } from "../types/enums";

const DOCUMENT_NAME = "User";
const COLLECTION_NAME = "users";

/** A cardholder — the person a card is issued to. Distinct from Admin. */
export interface IUser extends Document {
  _id: Types.ObjectId;
  fullName: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  dateOfBirth?: Date;
  address?: string;
  status: AccountStatus;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    // Indexed via schema.index() below, which also makes it unique-when-present.
    nationalId: { type: String, trim: true },
    dateOfBirth: { type: Date },
    address: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true, collection: COLLECTION_NAME }
);

// Unique only when present, so users without a national id are still allowed.
userSchema.index(
  { nationalId: 1 },
  { unique: true, partialFilterExpression: { nationalId: { $type: "string" } } }
);

export default model<IUser>(DOCUMENT_NAME, userSchema);
