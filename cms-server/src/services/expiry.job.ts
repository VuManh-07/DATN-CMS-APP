"use strict";

import Card from "../models/card.model";
import { CardState, AdminRole } from "../types/enums";
import lifecycle from "./cardLifecycle.service";
import { Actor } from "../types/actor";

/**
 * Background sweep that retires cards past their expiry date.
 *
 * It runs each card through the normal `transition()` path rather than a bulk
 * update, so expiries land in CardStateHistory and the audit log exactly like
 * an operator-driven change. The actor is a synthetic system identity.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const EXPIRABLE_STATES = [
  CardState.ISSUED,
  CardState.ACTIVE,
  CardState.SUSPENDED,
  CardState.LOCKED,
];

const SYSTEM_ACTOR: Actor = {
  id: undefined as any,
  username: "system",
  role: AdminRole.SUPER_ADMIN,
};

let timer: NodeJS.Timeout | null = null;

const runOnce = async (): Promise<number> => {
  const due = await Card.find({
    state: { $in: EXPIRABLE_STATES },
    expiresAt: { $ne: null, $lte: new Date() },
  }).limit(500);

  let expired = 0;
  for (const card of due) {
    try {
      await lifecycle.transition(card, CardState.EXPIRED, SYSTEM_ACTOR, {
        reason: "validity period elapsed",
        metadata: { expiresAt: card.expiresAt },
      });
      expired++;
    } catch (err: any) {
      console.error(
        `[expiry] could not expire ${card.cardId}: ${err.message}`
      );
    }
  }

  if (expired) console.log(`[expiry] expired ${expired} card(s)`);
  return expired;
};

const startExpiryJob = () => {
  if (timer) return;
  // Delay the first sweep so it does not race the DB connection on boot.
  setTimeout(() => {
    runOnce().catch((err) => console.error("[expiry]", err.message));
  }, 30_000);

  timer = setInterval(() => {
    runOnce().catch((err) => console.error("[expiry]", err.message));
  }, CHECK_INTERVAL_MS);

  console.log("[expiry] job scheduled (hourly)");
};

const stopExpiryJob = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

export { startExpiryJob, stopExpiryJob, runOnce };
