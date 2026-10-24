"use strict";

import Card from "../models/card.model";
import User from "../models/user.model";
import Batch from "../models/batch.model";
import CardStateHistory from "../models/cardStateHistory.model";
import { CardState, BatchStatus } from "../types/enums";

/**
 * Dashboard aggregation: card counts by state, recent issuance trend, and the
 * most common lock reasons. All read-only, computed with aggregation pipelines
 * rather than loading documents.
 */
const dashboard = async (days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [stateRows, issuedTrend, lockReasons, totals, activeBatches] =
    await Promise.all([
      Card.aggregate([{ $group: { _id: "$state", count: { $sum: 1 } } }]),

      // Cards issued per day, from the audit-grade history collection.
      CardStateHistory.aggregate([
        { $match: { toState: CardState.ISSUED, at: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Card.aggregate([
        { $match: { state: CardState.LOCKED, lockReason: { $ne: null } } },
        { $group: { _id: "$lockReason", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      Promise.all([Card.countDocuments(), User.countDocuments()]),

      Batch.countDocuments({ status: BatchStatus.PERSONALIZING }),
    ]);

  // Report every state, including the ones with no cards, so the UI can render
  // a stable set of tiles.
  const byState: Record<string, number> = {};
  Object.values(CardState).forEach((s) => (byState[s] = 0));
  stateRows.forEach((row) => (byState[row._id] = row.count));

  const [totalCards, totalUsers] = totals;

  return {
    byState,
    totals: {
      cards: totalCards,
      users: totalUsers,
      activeBatches,
    },
    issuedTrend: issuedTrend.map((r) => ({ date: r._id, count: r.count })),
    topLockReasons: lockReasons.map((r) => ({
      reason: r._id,
      count: r.count,
    })),
    windowDays: days,
  };
};

export default { dashboard };
