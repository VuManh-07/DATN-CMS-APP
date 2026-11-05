"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import ReportController from "../../controllers/report.controller";

const router = Router();

// Read-only: every authenticated role, including AUDITOR, may see these.
router.get("/dashboard", asyncHandler(ReportController.dashboard));

export default router;
