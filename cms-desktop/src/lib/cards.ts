/** Shared card-domain constants for the renderer. Mirrors cms-server enums. */

export const CARD_STATES = [
  "CREATED",
  "PERSONALIZING",
  "PERSONALIZED",
  "PERSONALIZE_FAILED",
  "ISSUED",
  "ACTIVE",
  "SUSPENDED",
  "LOCKED",
  "REVOKED",
  "EXPIRED",
] as const;

export type CardState = (typeof CARD_STATES)[number];

/** antd Tag colours, chosen so "needs attention" states read as warm. */
export const STATE_COLOR: Record<CardState, string> = {
  CREATED: "default",
  PERSONALIZING: "processing",
  PERSONALIZED: "cyan",
  PERSONALIZE_FAILED: "error",
  ISSUED: "blue",
  ACTIVE: "success",
  SUSPENDED: "warning",
  LOCKED: "orange",
  REVOKED: "error",
  EXPIRED: "default",
};

/**
 * Which lifecycle actions make sense from a given state.
 *
 * This drives button visibility only — the server's transition table in
 * cardLifecycle.service.ts remains the authority, and will reject anything
 * that slips through.
 */
export const ACTIONS_BY_STATE: Record<CardState, string[]> = {
  CREATED: ["personalize", "assign-user", "rotate-key"],
  PERSONALIZING: [],
  PERSONALIZED: ["issue", "revoke"],
  PERSONALIZE_FAILED: ["personalize", "revoke", "rotate-key"],
  ISSUED: ["activate", "lock", "revoke", "replace", "rotate-key"],
  ACTIVE: ["lock", "suspend", "revoke", "replace", "rotate-key"],
  SUSPENDED: ["activate", "lock", "revoke"],
  LOCKED: ["unlock", "revoke", "replace", "rotate-key"],
  REVOKED: [],
  EXPIRED: [],
};

export const ACTION_LABEL: Record<string, string> = {
  personalize: "Personalize",
  "assign-user": "Assign cardholder",
  issue: "Issue",
  activate: "Activate",
  lock: "Lock",
  unlock: "Unlock",
  suspend: "Suspend",
  revoke: "Revoke",
  replace: "Replace",
  "rotate-key": "Change key set",
};

/** Actions that must not happen by accident. */
export const DESTRUCTIVE_ACTIONS = ["revoke", "replace", "rotate-key"];

/** Actions that require the operator to type a reason. */
export const REASON_REQUIRED = ["lock", "revoke"];

export type Role = "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "AUDITOR";

const ADMIN_ONLY = ["assign-user", "revoke", "replace", "rotate-key"];

/** Client-side mirror of the route guards, so the UI hides what would 403. */
export const canPerform = (role: Role | undefined, action: string): boolean => {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  if (role === "AUDITOR") return false;
  if (role === "ADMIN") return true;
  // OPERATOR
  return !ADMIN_ONLY.includes(action);
};
