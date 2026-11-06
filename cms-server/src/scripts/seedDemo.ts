"use strict";

/**
 * Populate the database with demo data so the whole CMS UI is explorable
 * without personalising real cards.
 *
 * Used by `yarn dev:standalone` (in-memory Mongo), and runnable on its own
 * against a real database with `yarn seed:demo`.
 *
 * Cards are driven through the real `transition()` path rather than inserted
 * with a final state, so every card arrives with a genuine lifecycle timeline
 * and matching audit rows — which is what the timeline and audit screens
 * display.
 */

import mongoose from "mongoose";
import config from "../configs/config.env";
import { applyDnsServers } from "../helpers/dnsConfig";
import Admin from "../models/admin.model";
import User from "../models/user.model";
import Card from "../models/card.model";
import CardStateHistory from "../models/cardStateHistory.model";
import KeySet from "../models/keySet.model";
import Batch from "../models/batch.model";
import AuditLog from "../models/auditLog.model";
import authService from "../services/auth.service";
import keySetService from "../services/keySet.service";
import cardService from "../services/card.service";
import lifecycle from "../services/cardLifecycle.service";
import { CardState, AdminRole, AccountStatus, BatchStatus } from "../types/enums";
import { Actor } from "../types/actor";

const CARDHOLDERS = [
  { fullName: "Nguyen Van An", nationalId: "001199012345", phone: "0901234567", email: "an.nguyen@example.com" },
  { fullName: "Tran Thi Binh", nationalId: "001199112346", phone: "0901234568", email: "binh.tran@example.com" },
  { fullName: "Le Hoang Cuong", nationalId: "001199212347", phone: "0901234569", email: "cuong.le@example.com" },
  { fullName: "Pham Thi Dung", nationalId: "001199312348", phone: "0901234570", email: "dung.pham@example.com" },
  { fullName: "Hoang Van Em", nationalId: "001199412349", phone: "0901234571", email: "em.hoang@example.com" },
  { fullName: "Vo Thi Giang", nationalId: "001199512350", phone: "0901234572", email: "giang.vo@example.com" },
  { fullName: "Dang Van Hai", nationalId: "001199612351", phone: "0901234573", email: "hai.dang@example.com" },
  { fullName: "Bui Thi Lan", nationalId: "001199712352", phone: "0901234574", email: "lan.bui@example.com" },
  { fullName: "Do Van Minh", nationalId: "001199812353", phone: "0901234575", email: "minh.do@example.com" },
  { fullName: "Ngo Thi Nga", nationalId: "001199912354", phone: "0901234576", email: "nga.ngo@example.com" },
];

const ADMINS = [
  { username: "admin", fullName: "Super Administrator", role: AdminRole.SUPER_ADMIN, password: "123@" },
  { username: "manager", fullName: "Card Manager", role: AdminRole.ADMIN, password: "123@" },
  { username: "operator", fullName: "Line Operator", role: AdminRole.OPERATOR, password: "123@" },
  { username: "auditor", fullName: "Compliance Auditor", role: AdminRole.AUDITOR, password: "123@" },
];

/** Walk a card from CREATED up to the requested state. */
const driveTo = async (
  cardId: string,
  target: CardState,
  actor: Actor,
  opts: { lockReason?: string; revokeReason?: string } = {}
) => {
  const path: CardState[] = [];

  // Every state is reached through personalization first.
  if (target !== CardState.CREATED) {
    path.push(CardState.PERSONALIZING);
  }
  if (target === CardState.PERSONALIZE_FAILED) {
    path.push(CardState.PERSONALIZE_FAILED);
  } else if (target !== CardState.CREATED && target !== CardState.PERSONALIZING) {
    path.push(CardState.PERSONALIZED);
    if (target !== CardState.PERSONALIZED) {
      path.push(CardState.ISSUED);
      if (target !== CardState.ISSUED) {
        path.push(CardState.ACTIVE);
        if (target !== CardState.ACTIVE) path.push(target);
      }
    }
  }

  for (const state of path) {
    const reason =
      state === CardState.LOCKED
        ? opts.lockReason || "locked by operator"
        : state === CardState.REVOKED
        ? opts.revokeReason || "revoked by administrator"
        : state === CardState.PERSONALIZE_FAILED
        ? "Step \"Write card identity\" failed: card returned SW 6A80"
        : undefined;

    await lifecycle.transition(cardId, state, actor, {
      reason,
      patch:
        state === CardState.PERSONALIZE_FAILED
          ? {
              lastPersonalizeError:
                'Step "Write card identity" failed: card returned SW 6A80',
            }
          : undefined,
    });
  }
};

/** Fabricate a plausible CSN so the list view is not full of dashes. */
const fakeCsn = (index: number) =>
  `3B6800000${(index + 1).toString(16).toUpperCase().padStart(2, "0")}73C84013009000`;

export const seedDemo = async () => {
  // Start from a clean slate so repeated runs stay predictable.
  await Promise.all([
    Admin.deleteMany({}),
    User.deleteMany({}),
    Card.deleteMany({}),
    CardStateHistory.deleteMany({}),
    KeySet.deleteMany({}),
    Batch.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  // --- admins, one per role so the RBAC differences are visible in the UI ---
  const admins: Record<string, any> = {};
  for (const a of ADMINS) {
    admins[a.username] = await Admin.create({
      username: a.username,
      fullName: a.fullName,
      passwordHash: await authService.hashPassword(a.password),
      role: a.role,
      status: AccountStatus.ACTIVE,
    });
  }

  const superAdmin: Actor = {
    id: admins.admin._id,
    username: admins.admin.username,
    role: AdminRole.SUPER_ADMIN,
  };
  const operator: Actor = {
    id: admins.operator._id,
    username: admins.operator.username,
    role: AdminRole.OPERATOR,
  };

  // --- key set ---
  // One key set, and it has to be the keys the chips actually carry. Nothing
  // in the personalization plan writes keys to a card (there is no PUT KEY
  // step), so a card authenticates with whatever its security domain was
  // loaded with — for lab cards, the GlobalPlatform default. Seeding anything
  // else would only produce key sets guaranteed to fail mutual authentication.
  const prodKeySet = await keySetService.create(
    {
      name: "test-gp-default",
      kvn: 1,
      derivationMode: "STATIC" as any,
      description: "GlobalPlatform default test key — lab cards only",
      keys: {
        Key_ENC: "404142434445464748494A4B4C4D4E4F",
        Key_MAC: "404142434445464748494A4B4C4D4E4F",
        Key_DEK: "404142434445464748494A4B4C4D4E4F",
      },
    },
    superAdmin
  );

  // --- cardholders ---
  const users = [];
  for (const person of CARDHOLDERS) {
    users.push(
      await User.create({
        ...person,
        status: AccountStatus.ACTIVE,
        createdBy: superAdmin.id,
      })
    );
  }

  // --- a batch, partly worked through ---
  const batch = await Batch.create({
    batchCode: "BATCH-2026-01",
    description: "First production run",
    quantity: 0,
    keySetId: prodKeySet.id.toString(),
    status: BatchStatus.PERSONALIZING,
    personalizedCount: 0,
    failedCount: 0,
    createdBy: superAdmin.id,
    startedAt: new Date(),
  });

  /**
   * One card per state, so every tile on the dashboard and every colour in
   * the list view has something behind it.
   */
  const plan: Array<{ user: number; state: CardState; batch?: boolean; lockReason?: string }> = [
    { user: 0, state: CardState.ACTIVE },
    { user: 1, state: CardState.ACTIVE },
    { user: 2, state: CardState.ACTIVE },
    { user: 3, state: CardState.ISSUED },
    { user: 4, state: CardState.ISSUED },
    { user: 5, state: CardState.LOCKED, lockReason: "Reported lost by cardholder" },
    { user: 6, state: CardState.LOCKED, lockReason: "Too many wrong PIN attempts" },
    { user: 7, state: CardState.SUSPENDED },
    { user: 8, state: CardState.PERSONALIZED, batch: true },
    { user: 9, state: CardState.PERSONALIZE_FAILED, batch: true },
    { user: 0, state: CardState.CREATED, batch: true },
    { user: 1, state: CardState.CREATED, batch: true },
  ];

  let csnIndex = 0;
  for (const entry of plan) {
    // A user may only hold one live card, so cards beyond the first for a
    // given person are left unassigned blanks in the batch.
    const assignUser =
      entry.state === CardState.CREATED ? undefined : users[entry.user]._id.toString();

    const card = await cardService.create(
      {
        userId: assignUser,
        csn: entry.state === CardState.CREATED ? undefined : fakeCsn(csnIndex++),
        keySetId: prodKeySet.id.toString(),
        batchId: entry.batch ? batch._id.toString() : undefined,
      },
      superAdmin
    );

    await driveTo(card.cardId, entry.state, operator, {
      lockReason: entry.lockReason,
    });
  }

  // --- a replaced card, to show the replacement chain ---
  // users[2] already holds an ACTIVE card from the plan above. Replace that
  // one rather than creating a second: a cardholder may only hold one live
  // card, so issuing another would (correctly) be refused.
  const damagedCard = await Card.findOne({
    userId: users[2]._id,
    state: CardState.ACTIVE,
  }).sort({ createdAt: 1 });

  if (damagedCard) {
    const { newCard } = await cardService.replace(
      damagedCard.cardId,
      "Card physically damaged",
      superAdmin
    );
    // Carry the replacement through to ACTIVE so the chain shows a working
    // card at the end of it.
    await driveTo(newCard.cardId, CardState.ACTIVE, operator);
  }

  // --- batch counters reflect what actually happened ---
  const [done, failed] = await Promise.all([
    Card.countDocuments({
      batchId: batch._id,
      state: { $in: [CardState.PERSONALIZED, CardState.ISSUED, CardState.ACTIVE] },
    }),
    Card.countDocuments({
      batchId: batch._id,
      state: CardState.PERSONALIZE_FAILED,
    }),
  ]);
  batch.personalizedCount = done;
  batch.failedCount = failed;
  batch.quantity = await Card.countDocuments({ batchId: batch._id });
  await batch.save();

  const counts = {
    admins: await Admin.countDocuments(),
    users: await User.countDocuments(),
    cards: await Card.countDocuments(),
    keySets: await KeySet.countDocuments(),
    history: await CardStateHistory.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
  };

  console.log("[seed:demo] created:", counts);
  console.log(
    "[seed:demo] sign in as admin / manager / operator / auditor — password 123@"
  );

  return counts;
};

// Allow running directly against a real database.
if (require.main === module) {
  (async () => {
    applyDnsServers();
  await mongoose.connect(config.mongoUri);
    console.log(`[seed:demo] connected to ${config.mongodb.name}`);
    await seedDemo();
    await mongoose.disconnect();
  })().catch((err) => {
    console.error("[seed:demo] failed:", err);
    process.exit(1);
  });
}
