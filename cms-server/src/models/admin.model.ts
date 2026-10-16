"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { AdminRole, AccountStatus } from "../types/enums";

const DOCUMENT_NAME = "Admin";
const COLLECTION_NAME = "admins";

export interface IAdmin extends Document {
  _id: Types.ObjectId;
  username: string;
  fullName: string;
  passwordHash: string;
  role: AdminRole;
  status: AccountStatus;
  lastLoginAt?: Date;
  failedLoginCount: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    // bcrypt hash — the plaintext password is never stored or logged.
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(AdminRole),
      required: true,
      default: AdminRole.OPERATOR,
    },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
    },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true, collection: COLLECTION_NAME }
);

export default model<IAdmin>(DOCUMENT_NAME, adminSchema);
