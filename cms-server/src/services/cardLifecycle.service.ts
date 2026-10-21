"use strict";

import { Request } from "express";
import { Types } from "mongoose";
import Card, { ICard } from "../models/card.model";
import CardStateHistory from "../models/cardStateHistory.model";
import { BadRequestError, NotFoundError } from "../core/error.response";
import {
  CardState,
  LIVE_CARD_STATES,
  TERMINAL_CARD_STATES,
  AuditResult,
} from "../types/enums";
import { Actor } from "../types/actor";
import auditService from "./audit.service";

/**
 * The single source of truth for the card lifecycle graph.
 *
 * Every state change in the system goes through `transition()` below, which is
 * the only place that writes CardStateHistory and the matching audit entry.
 * That is deliberate: it makes "changed state but forgot to audit" impossible
 * to express.
 */
export const CARD_TRANSITIONS: Record<CardState, CardState[]> = {
  [CardState.CREATED]: [CardState.PERSONALIZING],

  [CardState.PERSONALIZING]: [
    CardState.PERSONALIZED,
    CardState.PERSONALIZE_FAILED,
  ],

  // A failed run can be retried on the same card record.
  [CardState.PERSONALIZE_FAILED]: [
    CardState.PERSONALIZING,
    CardState.REVOKED,
  ],

  [CardState.PERSONALIZED]: [CardState.ISSUED, CardState.REVOKED],

  // Handed to the cardholder but not yet activated by them.
  [CardState.ISSUED]: [
    CardState.ACTIVE,
    CardState.LOCKED,
    CardState.REVOKED,
    CardState.EXPIRED,
    CardState.PERSONALIZING, // re-personalize / key rotation
  ],

  [CardState.ACTIVE]: [
    CardState.LOCKED,
    CardState.SUSPENDED,
    CardState.REVOKED,
    CardState.EXPIRED,
    CardState.PERSONALIZING,
  ],

  [CardState.SUSPENDED]: [
    CardState.ACTIVE,
    CardState.LOCKED,
    CardState.REVOKED,
    CardState.EXPIRED,
  ],

  [CardState.LOCKED]: [
    CardState.ACTIVE, // unlock
    CardState.REVOKED,
    CardState.EXPIRED,
    CardState.PERSONALIZING,
  ],

  // Terminal — nothing leaves these.
  [CardState.REVOKED]: [],
  [CardState.EXPIRED]: [],
};

export const isTransitionAllowed = (from: CardState, to: CardState): boolean =>
  (CARD_TRANSITIONS[from] || []).includes(to);

/**
 * Resolve a card by either identifier.
 *
 * Cards have two ids: the Mongo `_id` and the human-readable `cardId`
 * ("CARD-2610-AB12CD") that operators actually see and type. Callers use both,
 * so every lookup accepts both — resolving only `_id` here would throw a
 * CastError the moment a caller passed the card code.
 */
export const resolveCard = async (
  idOrCardId: string | Types.ObjectId | ICard
): Promise<ICard | null> => {
  if (typeof idOrCardId !== "string" && !(idOrCardId instanceof Types.ObjectId)) {
    return idOrCardId;
  }

  const value = idOrCardId.toString();

  if (Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value)) {
    const byId = await Card.findById(value);
    if (byId) return byId;
  }

  return Card.findOne({ cardId: value });
};

/** Timestamp column stamped when a card arrives in a given state. */
const STATE_TIMESTAMP: Partial<Record<CardState, keyof ICard>> = {
  [CardState.PERSONALIZED]: "personalizedAt",
  [CardState.ISSUED]: "issuedAt",
  [CardState.ACTIVE]: "activatedAt",
  [CardState.LOCKED]: "lockedAt",
  [CardState.REVOKED]: "revokedAt",
};

export interface TransitionOptions {
  reason?: string;
  /** Extra fields to persist on the card as part of this transition. */
  patch?: Partial<Record<keyof ICard, any>>;
  metadata?: Record<string, any>;
  req?: Request;
}

/**
 * Enforce that a cardholder holds at most one card that is out in the field.
 * Checked when a card becomes ISSUED, which is the moment it leaves the
 * factory for a person.
 */
const assertNoOtherLiveCard = async (card: ICard) => {
  if (!card.userId) return;

  const other = await Card.findOne({
    _id: { $ne: card._id },
    userId: card.userId,
    state: { $in: LIVE_CARD_STATES },
  }).lean();

  if (other) {
    throw new BadRequestError(
      `User already holds a live card (${other.cardId}, state ${other.state}). ` +
        `Revoke or replace it before issuing another.`
    );
  }
};

/**
 * Move a card to a new state.
 *
 * Rejects illegal transitions, stamps the matching timestamp, writes the
 * append-only history row and the audit entry, then returns the saved card.
 */
const transition = async (
  cardIdOrDoc: string | Types.ObjectId | ICard,
  toState: CardState,
  actor: Actor | null | undefined,
  options: TransitionOptions = {}
): Promise<ICard> => {
  const card = await resolveCard(cardIdOrDoc);
  if (!card) throw new NotFoundError("Card not found");

  const fromState = card.state;

  if (fromState === toState) {
    throw new BadRequestError(`Card is already in state ${toState}`);
  }

  if (TERMINAL_CARD_STATES.includes(fromState)) {
    await auditService.recordFailure({
      actor,
      action: `CARD_${toState}`,
      targetType: "Card",
      targetId: card.cardId,
      detail: { fromState, toState, reason: "terminal state" },
      req: options.req,
    });
    throw new BadRequestError(
      `Card is in terminal state ${fromState} and cannot be changed`
    );
  }

  if (!isTransitionAllowed(fromState, toState)) {
    await auditService.recordFailure({
      actor,
      action: `CARD_${toState}`,
      targetType: "Card",
      targetId: card.cardId,
      detail: { fromState, toState, reason: "illegal transition" },
      req: options.req,
    });
    throw new BadRequestError(
      `Illegal transition ${fromState} -> ${toState}. Allowed: ` +
        `${(CARD_TRANSITIONS[fromState] || []).join(", ") || "(none)"}`
    );
  }

  if (toState === CardState.ISSUED) {
    await assertNoOtherLiveCard(card);
  }

  // Apply caller-supplied fields first so an explicit value wins over the
  // automatic timestamp below.
  if (options.patch) {
    Object.entries(options.patch).forEach(([key, value]) => {
      (card as any)[key] = value;
    });
  }

  card.state = toState;

  const stampField = STATE_TIMESTAMP[toState];
  if (stampField && !(card as any)[stampField]) {
    (card as any)[stampField] = new Date();
  }

  if (toState === CardState.LOCKED && options.reason) {
    card.lockReason = options.reason;
  }
  if (toState === CardState.REVOKED && options.reason) {
    card.revokeReason = options.reason;
  }
  // Leaving LOCKED clears the reason so stale text does not linger in the UI.
  if (fromState === CardState.LOCKED && toState === CardState.ACTIVE) {
    card.lockReason = undefined;
    card.lockedAt = undefined;
  }

  await card.save();

  await CardStateHistory.create({
    cardId: card._id,
    fromState,
    toState,
    reason: options.reason,
    actorId: actor?.id,
    actorRole: actor?.role,
    metadata: options.metadata,
    at: new Date(),
  });

  await auditService.record({
    actor,
    action: `CARD_${toState}`,
    targetType: "Card",
    targetId: card.cardId,
    result: AuditResult.SUCCESS,
    detail: { fromState, toState, reason: options.reason, ...options.metadata },
    req: options.req,
  });

  return card;
};

/** Full transition timeline for a card, newest first. */
const history = async (cardObjectId: Types.ObjectId | string) =>
  CardStateHistory.find({ cardId: cardObjectId })
    .sort({ at: -1 })
    .populate("actorId", "username fullName role")
    .lean();

export default {
  transition,
  history,
  isTransitionAllowed,
  resolveCard,
  CARD_TRANSITIONS,
};
