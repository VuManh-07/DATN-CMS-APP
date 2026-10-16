"use strict";

import { Schema, model, Document, Types } from "mongoose";
import { BatchStatus } from "../types/enums";

const DOCUMENT_NAME = "Batch";
const COLLECTION_NAME = "batches";

/** A production run: N cards personalised together under one key set. */
export interface IBatch extends Document {
  _id: Types.ObjectId;
  batchCode: string;
  description?: string;
  quantity: number;
  keySetId?: Types.ObjectId;
  status: BatchStatus;
  personalizedCount: number;
  failedCount: number;
  createdBy?: Types.ObjectId;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<IBatch>(
  {
    batchCode: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    quantity: { type: Number, required: true, default: 0 },
    keySetId: { type: Schema.Types.ObjectId, ref: "KeySet" },
    status: {
      type: String,
      enum: Object.values(BatchStatus),
      default: BatchStatus.DRAFT,
      index: true,
    },
    personalizedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTION_NAME }
);

export default model<IBatch>(DOCUMENT_NAME, batchSchema);
