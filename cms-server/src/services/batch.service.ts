"use strict";

import { Request } from "express";
import { parse } from "csv-parse/sync";
import Batch from "../models/batch.model";
import Card from "../models/card.model";
import User from "../models/user.model";
import {
  BadRequestError,
  ConflictRequestError,
  NotFoundError,
} from "../core/error.response";
import {
  BatchStatus,
  CardState,
  AccountStatus,
  KeySetStatus,
} from "../types/enums";
import { Actor } from "../types/actor";
import auditService from "./audit.service";
import cardService from "./card.service";
import keySetService from "./keySet.service";

const list = async () =>
  Batch.find()
    .sort({ createdAt: -1 })
    .populate("keySetId", "name kvn")
    .lean();

export interface CreateBatchInput {
  batchCode: string;
  description?: string;
  quantity?: number;
  keySetId?: string;
}

const create = async (
  input: CreateBatchInput,
  actor: Actor,
  req?: Request
) => {
  if (!input.batchCode) throw new BadRequestError("batchCode is required");

  if (await Batch.findOne({ batchCode: input.batchCode })) {
    throw new ConflictRequestError(`Batch ${input.batchCode} already exists`);
  }

  // Every card imported into this batch inherits this key set, so it is
  // stated up front rather than defaulted to whichever one happens to be
  // oldest.
  if (!input.keySetId) {
    throw new BadRequestError(
      "keySetId is required: pick the key set the cards in this batch carry"
    );
  }
  const keySet = await keySetService.findById(input.keySetId);
  if (keySet.status !== KeySetStatus.ACTIVE) {
    throw new BadRequestError(
      `Key set "${keySet.name}" is ${keySet.status} and cannot be given to a new batch`
    );
  }
  const keySetId = input.keySetId;

  const batch = await Batch.create({
    batchCode: input.batchCode,
    description: input.description,
    quantity: input.quantity || 0,
    keySetId,
    status: BatchStatus.DRAFT,
    createdBy: actor.id,
  });

  await auditService.record({
    actor,
    action: "BATCH_CREATE",
    targetType: "Batch",
    targetId: batch.batchCode,
    detail: { quantity: batch.quantity },
    req,
  });

  return batch;
};

export interface ImportRow {
  fullName: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  dateOfBirth?: string;
  address?: string;
}

/**
 * Import a CSV of cardholders into a batch, creating one user and one blank
 * card (state CREATED) per row.
 *
 * Rows are processed independently: a bad row is reported in `errors` and the
 * rest still import, so one typo in a 500-row file does not sink the whole
 * run. Existing users are matched by nationalId and reused rather than
 * duplicated.
 */
const importUsers = async (
  batchId: string,
  csvContent: string,
  actor: Actor,
  req?: Request
) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new NotFoundError("Batch not found");
  if (batch.status !== BatchStatus.DRAFT) {
    throw new BadRequestError(
      `Batch is ${batch.status}; users can only be imported into a DRAFT batch`
    );
  }

  let rows: ImportRow[];
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err: any) {
    throw new BadRequestError(`Could not parse CSV: ${err.message}`);
  }

  if (!rows.length) throw new BadRequestError("CSV contains no data rows");

  const created: Array<{ cardId: string; userId: string; fullName: string }> = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.fullName) {
        throw new Error("fullName column is required");
      }

      let user = row.nationalId
        ? await User.findOne({ nationalId: row.nationalId })
        : null;

      if (!user) {
        user = await User.create({
          fullName: row.fullName,
          email: row.email || undefined,
          phone: row.phone || undefined,
          nationalId: row.nationalId || undefined,
          dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
          address: row.address || undefined,
          status: AccountStatus.ACTIVE,
          createdBy: actor.id,
        });
      }

      const card = await cardService.create(
        {
          userId: user._id.toString(),
          batchId: batch._id.toString(),
          keySetId: batch.keySetId?.toString(),
        },
        actor
      );

      created.push({
        cardId: card.cardId,
        userId: user._id.toString(),
        fullName: user.fullName,
      });
    } catch (err: any) {
      // +2 because row 1 is the header and arrays are 0-based.
      errors.push({ row: i + 2, message: err.message });
    }
  }

  batch.quantity = (batch.quantity || 0) + created.length;
  await batch.save();

  await auditService.record({
    actor,
    action: "BATCH_IMPORT_USERS",
    targetType: "Batch",
    targetId: batch.batchCode,
    detail: {
      rows: rows.length,
      created: created.length,
      failed: errors.length,
    },
    req,
  });

  return { batch, created, errors, totalRows: rows.length };
};

/** Live counts for the batch progress screen. */
const progress = async (batchId: string) => {
  const batch = await Batch.findById(batchId).lean();
  if (!batch) throw new NotFoundError("Batch not found");

  const byState = await Card.aggregate([
    { $match: { batchId: batch._id } },
    { $group: { _id: "$state", count: { $sum: 1 } } },
  ]);

  const states: Record<string, number> = {};
  Object.values(CardState).forEach((s) => (states[s] = 0));
  byState.forEach((row) => (states[row._id] = row.count));

  const total = Object.values(states).reduce((a, b) => a + b, 0);
  const done =
    states[CardState.PERSONALIZED] +
    states[CardState.ISSUED] +
    states[CardState.ACTIVE];

  return {
    batch,
    states,
    total,
    done,
    failed: states[CardState.PERSONALIZE_FAILED],
    pending: states[CardState.CREATED],
  };
};

const setStatus = async (
  batchId: string,
  status: BatchStatus,
  actor: Actor,
  req?: Request
) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new NotFoundError("Batch not found");

  batch.status = status;
  if (status === BatchStatus.PERSONALIZING && !batch.startedAt) {
    batch.startedAt = new Date();
  }
  if (status === BatchStatus.COMPLETED) {
    batch.completedAt = new Date();
  }
  await batch.save();

  await auditService.record({
    actor,
    action: "BATCH_SET_STATUS",
    targetType: "Batch",
    targetId: batch.batchCode,
    detail: { status },
    req,
  });

  return batch;
};

export default { list, create, importUsers, progress, setStatus };
