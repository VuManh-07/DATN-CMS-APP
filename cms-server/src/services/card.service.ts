"use strict";

import { Request } from "express";
import Card, { ICard, ICardAccount } from "../models/card.model";
import CardStateHistory from "../models/cardStateHistory.model";
import User from "../models/user.model";
import Batch from "../models/batch.model";
import KeySet from "../models/keySet.model";
import {
  BadRequestError,
  ConflictRequestError,
  NotFoundError,
} from "../core/error.response";
import {
  CardState,
  LIVE_CARD_STATES,
  TERMINAL_CARD_STATES,
  BatchStatus,
  KeySetStatus,
} from "../types/enums";
import { Actor } from "../types/actor";
import lifecycle from "./cardLifecycle.service";
import auditService from "./audit.service";
import {
  buildPersonalizationPlan,
  PlanOptions,
} from "./personalizationPlan";

const DEFAULT_AID = "A00001020304";
/** Cards are valid for this long from the moment they are issued. */
const DEFAULT_VALIDITY_YEARS = 3;

/** CMS card id: CARD-<yy><mm>-<6 random chars>. Human-readable and unique. */
const generateCardId = (): string => {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CARD-${stamp}-${rand}`;
};

export interface ListCardsQuery {
  q?: string;
  state?: CardState;
  batchId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

const list = async (query: ListCardsQuery) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Number(query.limit) || 25);

  const filter: Record<string, any> = {};
  if (query.state) filter.state = query.state;
  if (query.batchId) filter.batchId = query.batchId;
  if (query.userId) filter.userId = query.userId;
  if (query.q) {
    const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ cardId: rx }, { csn: rx }];
  }

  const [items, total] = await Promise.all([
    Card.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "fullName nationalId phone")
      .lean(),
    Card.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export interface CreateCardInput {
  userId?: string;
  csn?: string;
  aid?: string;
  keySetId?: string;
  batchId?: string;
  expiresAt?: string;
}

const create = async (
  input: CreateCardInput,
  actor: Actor,
  req?: Request
) => {
  if (input.userId && !(await User.findById(input.userId))) {
    throw new NotFoundError("User not found");
  }

  if (input.csn && (await Card.findOne({ csn: input.csn.toUpperCase() }))) {
    throw new ConflictRequestError(
      `A card with CSN ${input.csn} already exists`
    );
  }

  // Which keys a card is born with decides whether its secure channel will
  // ever open, so it is stated, never guessed. The old fallback picked the
  // oldest active key set, which silently handed new cards an obsolete one.
  if (!input.keySetId) {
    throw new BadRequestError(
      "keySetId is required: pick the key set holding the keys this chip carries"
    );
  }
  const keySet = await KeySet.findById(input.keySetId);
  if (!keySet) throw new NotFoundError("Key set not found");
  if (keySet.status !== KeySetStatus.ACTIVE) {
    throw new BadRequestError(
      `Key set "${keySet.name}" is ${keySet.status} and cannot be given to a new card`
    );
  }
  const keySetId = input.keySetId;

  const card = await Card.create({
    cardId: generateCardId(),
    csn: input.csn?.toUpperCase(),
    userId: input.userId,
    state: CardState.CREATED,
    aid: input.aid || DEFAULT_AID,
    keySetId,
    kvn: 1,
    batchId: input.batchId,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    createdBy: actor.id,
  });

  // Seed the timeline with the creation event, so a card's history is complete
  // from birth rather than starting at its first transition.
  await CardStateHistory.create({
    cardId: card._id,
    fromState: null,
    toState: CardState.CREATED,
    reason: "card record created",
    actorId: actor.id,
    actorRole: actor.role,
    at: new Date(),
  });

  await auditService.record({
    actor,
    action: "CARD_CREATE",
    targetType: "Card",
    targetId: card.cardId,
    detail: { userId: input.userId, csn: card.csn, batchId: input.batchId },
    req,
  });

  return card;
};

/** Accepts either the Mongo _id or the human-readable cardId. */
const findByIdOrCardId = async (idOrCardId: string): Promise<ICard> => {
  const card = await lifecycle.resolveCard(idOrCardId);
  if (!card) throw new NotFoundError("Card not found");
  return card;
};

/** Card detail with cardholder, key set name and the full state timeline. */
const detail = async (idOrCardId: string) => {
  const card = await findByIdOrCardId(idOrCardId);
  const [populated, history] = await Promise.all([
    Card.findById(card._id)
      .populate("userId", "fullName nationalId phone email")
      .populate("keySetId", "name kvn derivationMode status")
      .populate("batchId", "batchCode status")
      .populate("replacesCardId", "cardId state")
      .populate("replacedByCardId", "cardId state")
      .lean(),
    lifecycle.history(card._id),
  ]);

  return { ...populated, history };
};

const assignUser = async (
  idOrCardId: string,
  userId: string,
  actor: Actor,
  req?: Request
) => {
  const card = await findByIdOrCardId(idOrCardId);

  if (!(await User.findById(userId))) throw new NotFoundError("User not found");

  if (LIVE_CARD_STATES.includes(card.state)) {
    throw new BadRequestError(
      `Cannot reassign a card in state ${card.state}; revoke and replace it instead`
    );
  }

  const previousUserId = card.userId?.toString();
  card.userId = userId as any;
  await card.save();

  await auditService.record({
    actor,
    action: "CARD_ASSIGN_USER",
    targetType: "Card",
    targetId: card.cardId,
    detail: { previousUserId, userId },
    req,
  });

  return card;
};

/**
 * Bind the physical chip serial number to this card record.
 *
 * Called by the desktop app the first time it reads a card. Rebinding a
 * different CSN is refused, since that would silently repoint a card's history
 * at a different piece of hardware.
 */
const bindCsn = async (
  idOrCardId: string,
  csn: string,
  actor: Actor,
  req?: Request
) => {
  if (!csn) throw new BadRequestError("csn is required");
  const normalized = csn.toUpperCase();

  const card = await findByIdOrCardId(idOrCardId);

  if (card.csn && card.csn !== normalized) {
    throw new ConflictRequestError(
      `Card ${card.cardId} is already bound to CSN ${card.csn}`
    );
  }

  const otherCard = await Card.findOne({
    csn: normalized,
    _id: { $ne: card._id },
  });
  if (otherCard) {
    throw new ConflictRequestError(
      `CSN ${normalized} is already bound to card ${otherCard.cardId}`
    );
  }

  card.csn = normalized;
  await card.save();

  await auditService.record({
    actor,
    action: "CARD_BIND_CSN",
    targetType: "Card",
    targetId: card.cardId,
    detail: { csn: normalized },
    req,
  });

  return card;
};

/**
 * Begin a personalization run: move to PERSONALIZING and hand the operator
 * the ordered command plan to execute against the card.
 */
const startPersonalization = async (
  idOrCardId: string,
  options: PlanOptions,
  actor: Actor,
  req?: Request
) => {
  const card = await findByIdOrCardId(idOrCardId);

  if (!card.keySetId) {
    throw new BadRequestError(
      "Card has no key set assigned; cannot open a secure channel"
    );
  }

  const updated = await lifecycle.transition(
    card,
    CardState.PERSONALIZING,
    actor,
    {
      reason: options?.cardCode ? "personalize (custom code)" : "personalize",
      patch: { lastPersonalizeError: undefined },
      req,
    }
  );

  if (updated.batchId) {
    await Batch.findByIdAndUpdate(updated.batchId, {
      status: BatchStatus.PERSONALIZING,
      $setOnInsert: {},
      startedAt: new Date(),
    });
  }

  return {
    card: updated,
    plan: buildPersonalizationPlan(updated, options || {}),
  };
};

export interface CompletePersonalizationInput {
  success: boolean;
  error?: string;
  appletVersion?: string;
  csn?: string;
  /** Per-step outcomes from the operator terminal, kept for audit. */
  stepResults?: Array<{ key: string; sw?: string; ok: boolean }>;
}

const completePersonalization = async (
  idOrCardId: string,
  input: CompletePersonalizationInput,
  actor: Actor,
  req?: Request
) => {
  const card = await findByIdOrCardId(idOrCardId);

  if (card.state !== CardState.PERSONALIZING) {
    throw new BadRequestError(
      `Card is in state ${card.state}; expected PERSONALIZING`
    );
  }

  // A run may be the first time we learn the CSN.
  if (input.csn && !card.csn) {
    await bindCsn(card.cardId, input.csn, actor, req);
  }

  const toState = input.success
    ? CardState.PERSONALIZED
    : CardState.PERSONALIZE_FAILED;

  const updated = await lifecycle.transition(card, toState, actor, {
    reason: input.success ? "personalization succeeded" : input.error,
    patch: {
      appletVersion: input.appletVersion || card.appletVersion,
      lastPersonalizeError: input.success ? undefined : input.error,
    },
    metadata: { stepResults: input.stepResults },
    req,
  });

  if (updated.batchId) {
    await Batch.findByIdAndUpdate(updated.batchId, {
      $inc: input.success
        ? { personalizedCount: 1 }
        : { failedCount: 1 },
    });
  }

  return updated;
};

/** Issue: the card physically leaves for the cardholder. */
const issue = async (idOrCardId: string, actor: Actor, req?: Request) => {
  const card = await findByIdOrCardId(idOrCardId);

  if (!card.userId) {
    throw new BadRequestError(
      "Cannot issue a card with no cardholder assigned"
    );
  }

  const expiresAt =
    card.expiresAt ||
    new Date(
      new Date().setFullYear(new Date().getFullYear() + DEFAULT_VALIDITY_YEARS)
    );

  return lifecycle.transition(card, CardState.ISSUED, actor, {
    reason: "issued to cardholder",
    patch: { expiresAt },
    req,
  });
};

/** Activation — in practice triggered by the holder's first PIN change. */
const activate = async (idOrCardId: string, actor: Actor, req?: Request) =>
  lifecycle.transition(
    await findByIdOrCardId(idOrCardId),
    CardState.ACTIVE,
    actor,
    { reason: "activated by cardholder", req }
  );

/**
 * Record the accounts a wallet derived on the chip.
 *
 * Public key material only. Replaces the whole list rather than merging: the
 * card is the source of truth, so a slot deleted on the chip must disappear
 * here too.
 */
const syncAccounts = async (
  card: ICard,
  accounts: ICardAccount[],
  actor: Actor | null,
  req?: Request
) => {
  const cleaned = accounts
    .filter((a) => a && a.address && a.publicKey)
    .map((a) => ({
      index: Number(a.index) || 0,
      address: String(a.address).trim(),
      publicKey: String(a.publicKey).trim(),
      name: a.name ? String(a.name).trim() : undefined,
    }))
    .sort((a, b) => a.index - b.index);

  card.accounts = cleaned;
  card.accountsSyncedAt = new Date();
  await card.save();

  await auditService.record({
    actor,
    action: "CARD_ACCOUNTS_SYNCED",
    targetType: "Card",
    targetId: card.cardId,
    detail: { count: cleaned.length, indexes: cleaned.map((a) => a.index) },
    req,
  });

  return card;
};

/**
 * Activation driven by the wallet, authorised by an SCP03 session.
 *
 * The holder sets the card up on their own device, which has no CMS account —
 * so the proof here is possession of the chip, established by the session
 * having passed EXTERNAL AUTHENTICATE. The caller resolves the session to a
 * card; this function owns what may change as a result.
 *
 * Idempotent on state: a card already ACTIVE still has its accounts refreshed,
 * because the wallet re-reports them whenever the holder adds one.
 */
const activateFromWallet = async (
  card: ICard,
  accounts: ICardAccount[] | undefined,
  req?: Request
) => {
  if (accounts?.length) {
    await syncAccounts(card, accounts, null, req);
  }

  if (card.state === CardState.ACTIVE) return detail(card.cardId);

  await lifecycle.transition(card, CardState.ACTIVE, null, {
    reason: "activated by cardholder from the wallet app",
    req,
  });

  return detail(card.cardId);
};

const lock = async (
  idOrCardId: string,
  reason: string,
  actor: Actor,
  req?: Request
) => {
  if (!reason) throw new BadRequestError("reason is required to lock a card");
  return lifecycle.transition(
    await findByIdOrCardId(idOrCardId),
    CardState.LOCKED,
    actor,
    { reason, req }
  );
};

const unlock = async (idOrCardId: string, actor: Actor, req?: Request) =>
  lifecycle.transition(
    await findByIdOrCardId(idOrCardId),
    CardState.ACTIVE,
    actor,
    { reason: "unlocked by operator", req }
  );

const suspend = async (
  idOrCardId: string,
  reason: string,
  actor: Actor,
  req?: Request
) =>
  lifecycle.transition(
    await findByIdOrCardId(idOrCardId),
    CardState.SUSPENDED,
    actor,
    { reason: reason || "suspended by operator", req }
  );

const revoke = async (
  idOrCardId: string,
  reason: string,
  actor: Actor,
  req?: Request
) => {
  if (!reason) throw new BadRequestError("reason is required to revoke a card");
  return lifecycle.transition(
    await findByIdOrCardId(idOrCardId),
    CardState.REVOKED,
    actor,
    { reason, req }
  );
};

/**
 * Replace a card: revoke the old one (if still live) and create a fresh card
 * for the same holder, linked in both directions so the history is traceable.
 */
const replace = async (
  idOrCardId: string,
  reason: string,
  actor: Actor,
  req?: Request
) => {
  const oldCard = await findByIdOrCardId(idOrCardId);

  if (!oldCard.userId) {
    throw new BadRequestError(
      "Cannot replace a card that has no cardholder assigned"
    );
  }
  if (oldCard.replacedByCardId) {
    throw new ConflictRequestError(
      `Card ${oldCard.cardId} has already been replaced`
    );
  }

  // Revoke first — otherwise the new card would trip the one-live-card rule.
  if (oldCard.state !== CardState.REVOKED) {
    await lifecycle.transition(oldCard, CardState.REVOKED, actor, {
      reason: reason || "replaced",
      req,
    });
  }

  const newCard = await Card.create({
    cardId: generateCardId(),
    userId: oldCard.userId,
    state: CardState.CREATED,
    aid: oldCard.aid,
    keySetId: oldCard.keySetId,
    kvn: 1,
    replacesCardId: oldCard._id,
    createdBy: actor.id,
  });

  oldCard.replacedByCardId = newCard._id;
  await oldCard.save();

  await auditService.record({
    actor,
    action: "CARD_REPLACE",
    targetType: "Card",
    targetId: oldCard.cardId,
    detail: { reason, newCardId: newCard.cardId },
    req,
  });

  return { oldCard, newCard };
};

/**
 * Rotate the SCP03 key set on an already-issued card.
 *
 * The card goes back to PERSONALIZING with the new key set and an incremented
 * KVN; the operator then runs the returned plan to write the new keys.
 */
const rotateKey = async (
  idOrCardId: string,
  targetKeySetId: string,
  actor: Actor,
  req?: Request
) => {
  const card = await findByIdOrCardId(idOrCardId);

  const targetKeySet = await KeySet.findById(targetKeySetId);
  if (!targetKeySet) throw new NotFoundError("Target key set not found");
  if (card.keySetId?.toString() === targetKeySetId) {
    throw new BadRequestError("Card already uses this key set");
  }

  const updated = await lifecycle.transition(
    card,
    CardState.PERSONALIZING,
    actor,
    {
      reason: `key rotation to "${targetKeySet.name}"`,
      patch: {
        keySetId: targetKeySet._id,
        kvn: targetKeySet.kvn,
        lastPersonalizeError: undefined,
      },
      metadata: {
        previousKeySetId: card.keySetId?.toString(),
        previousKvn: card.kvn,
      },
      req,
    }
  );

  return {
    card: updated,
    plan: buildPersonalizationPlan(updated, {}),
  };
};

/**
 * Record a wallet-data reset performed on the chip by the holder's app.
 *
 * This is not a lifecycle transition: wiping the seed, accounts, tokens and
 * networks leaves the same issued card in the same state. It is recorded
 * because an operator investigating "my funds are gone" needs to see that a
 * reset happened, who was holding the card, and when. Retiring a card for good
 * is revoke(), which is a different, admin-only action.
 */
const recordWalletReset = async (
  idOrCardId: string,
  input: { note?: string } = {},
  actor: Actor,
  req?: Request
) => {
  const card = await findByIdOrCardId(idOrCardId);

  if (TERMINAL_CARD_STATES.includes(card.state)) {
    throw new BadRequestError(
      `Cannot reset the wallet on a card in state ${card.state}`
    );
  }

  await auditService.record({
    actor,
    action: "CARD_WALLET_RESET",
    targetType: "Card",
    targetId: card.cardId,
    detail: { note: input.note, state: card.state },
    req,
  });

  return detail(card.cardId);
};

export default {
  list,
  create,
  detail,
  findByIdOrCardId,
  assignUser,
  bindCsn,
  startPersonalization,
  completePersonalization,
  issue,
  activate,
  activateFromWallet,
  syncAccounts,
  lock,
  unlock,
  suspend,
  revoke,
  replace,
  rotateKey,
  recordWalletReset,
};
