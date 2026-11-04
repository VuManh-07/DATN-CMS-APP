"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import Scp03Controller from "../../controllers/scp03.controller";

const router = Router();

// Open to anonymous callers: the wallet app has no CMS account. An
// operator's token is still honoured and still recorded — req.actor is
// simply absent for the wallet, and the audit entry says so.
//
// What stops abuse is the protocol, not this gate: every step is bound to
// the card's own challenge and cryptogram, so a caller without the chip
// gets no further than a session that can never be authenticated.

router.post("/hostChallenge", asyncHandler(Scp03Controller.hostChallenge));
router.post("/initHostSCP03", asyncHandler(Scp03Controller.initHostSCP03));
router.get("/hostCryptogram", asyncHandler(Scp03Controller.hostCryptogram));
router.post("/generateCMAC", asyncHandler(Scp03Controller.generateCMAC));
router.post("/channelFinish", asyncHandler(Scp03Controller.channelFinish));
router.post("/wrap", asyncHandler(Scp03Controller.wrap));
router.post("/unwrap", asyncHandler(Scp03Controller.unwrap));
router.get("/reset", asyncHandler(Scp03Controller.reset));

export default router;
