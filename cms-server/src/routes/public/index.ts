"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import PublicCardController from "../../controllers/publicCard.controller";

/**
 * Unauthenticated endpoints for the wallet app.
 *
 * Coldwallet is a cardholder's device, not an operator terminal: it has no
 * CMS account to log in with, yet it must resolve the chip in its reader to a
 * card id before /scp03 can open a channel. Only what that resolution needs
 * is exposed here — never key sets, cardholders, history or audit.
 */

const router = Router();

router.get("/cards/lookup", asyncHandler(PublicCardController.lookup));

// Authorised by an authenticated SCP03 session, not by a CMS role.
router.post("/cards/activate", asyncHandler(PublicCardController.activate));

export default router;
