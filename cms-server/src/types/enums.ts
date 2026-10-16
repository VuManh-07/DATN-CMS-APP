"use strict";

/** Lifecycle states of a card. See CARD_TRANSITIONS for the allowed graph. */
export enum CardState {
  CREATED = "CREATED",
  PERSONALIZING = "PERSONALIZING",
  PERSONALIZED = "PERSONALIZED",
  PERSONALIZE_FAILED = "PERSONALIZE_FAILED",
  ISSUED = "ISSUED",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  LOCKED = "LOCKED",
  REVOKED = "REVOKED",
  EXPIRED = "EXPIRED",
}

/** States in which a card counts as "in the field" — a user may hold only one. */
export const LIVE_CARD_STATES: CardState[] = [
  CardState.ISSUED,
  CardState.ACTIVE,
  CardState.SUSPENDED,
  CardState.LOCKED,
];

/** Terminal states: no transition may leave them. */
export const TERMINAL_CARD_STATES: CardState[] = [
  CardState.REVOKED,
  CardState.EXPIRED,
];

export enum AdminRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  OPERATOR = "OPERATOR",
  AUDITOR = "AUDITOR",
}

export enum AccountStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum KeySetStatus {
  ACTIVE = "ACTIVE",
  DEPRECATED = "DEPRECATED",
  COMPROMISED = "COMPROMISED",
}

/**
 * STATIC            — every card shares the master key (test cards only).
 * DIVERSIFIED_BY_CSN — per-card key derived from the master key and the CSN.
 */
export enum KeyDerivationMode {
  STATIC = "STATIC",
  DIVERSIFIED_BY_CSN = "DIVERSIFIED_BY_CSN",
}

export enum BatchStatus {
  DRAFT = "DRAFT",
  PERSONALIZING = "PERSONALIZING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum AuditResult {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
}
