"use strict";

import express from "express";
import { authenticate, authenticateOptional } from "../auth/checkAuth";
import { asyncHandler } from "../helpers/asyncHandler";
import ReportController from "../controllers/report.controller";

import authRoutes from "./auth";
import userRoutes from "./users";
import cardRoutes from "./cards";
import keySetRoutes from "./keysets";
import batchRoutes from "./batches";
import reportRoutes from "./reports";
import scp03Routes from "./scp03";
import publicRoutes from "./public";

const router = express.Router();

// /auth handles its own public-vs-authenticated split.
router.use("/auth", authRoutes);

// The wallet app runs on a cardholder's machine with no CMS account, so
// the two things it needs are reachable without one: resolving the chip
// in its reader to a card id, and the SCP03 exchange itself. Neither is a
// way in on its own — every /scp03 step is checked against the card's own
// cryptograms, so without the physical chip and its keys the session
// cannot be completed.
router.use("/public", publicRoutes);
router.use("/scp03", authenticateOptional, scp03Routes);

// Everything below requires a valid access token. In the original demo this
// middleware was commented out, leaving the API wide open.
router.use(authenticate);

router.use("/users", userRoutes);
router.use("/cards", cardRoutes);
router.use("/keysets", keySetRoutes);
router.use("/batches", batchRoutes);
router.use("/reports", reportRoutes);

router.get("/audit-logs", asyncHandler(ReportController.auditLogs));

export default router;
