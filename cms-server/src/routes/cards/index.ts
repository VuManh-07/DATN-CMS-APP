"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import {
  requireRole,
  ADMIN_ROLES,
  OPERATOR_ROLES,
} from "../../auth/checkAuth";
import CardController from "../../controllers/card.controller";

const router = Router();

// --- read ---
router.get("/", asyncHandler(CardController.list));
router.get("/:id", asyncHandler(CardController.detail));

// --- operator: the day-to-day personalization and lock/unlock work ---
const operator = requireRole(...OPERATOR_ROLES);

router.post("/:id/bind-csn", operator, asyncHandler(CardController.bindCsn));
router.post(
  "/:id/personalize/start",
  operator,
  asyncHandler(CardController.startPersonalization)
);
router.post(
  "/:id/personalize/complete",
  operator,
  asyncHandler(CardController.completePersonalization)
);
router.post("/:id/issue", operator, asyncHandler(CardController.issue));
router.post("/:id/activate", operator, asyncHandler(CardController.activate));
router.post("/:id/lock", operator, asyncHandler(CardController.lock));
router.post("/:id/unlock", operator, asyncHandler(CardController.unlock));
router.post("/:id/suspend", operator, asyncHandler(CardController.suspend));

// A wallet reset is performed by the cardholder on their own chip; the
// operator terminal only reports it, so it sits with the operator routes.
router.post(
  "/:id/wallet-reset",
  operator,
  asyncHandler(CardController.walletReset)
);

// --- admin: creating records and irreversible / key-bearing actions ---
const admin = requireRole(...ADMIN_ROLES);

router.post("/", admin, asyncHandler(CardController.create));
router.post("/:id/assign-user", admin, asyncHandler(CardController.assignUser));
router.post("/:id/revoke", admin, asyncHandler(CardController.revoke));
router.post("/:id/replace", admin, asyncHandler(CardController.replace));
router.post("/:id/rotate-key", admin, asyncHandler(CardController.rotateKey));

export default router;
