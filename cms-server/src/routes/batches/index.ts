"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import {
  requireRole,
  ADMIN_ROLES,
  OPERATOR_ROLES,
} from "../../auth/checkAuth";
import BatchController from "../../controllers/batch.controller";

const router = Router();

router.get("/", asyncHandler(BatchController.list));
router.get("/:id/progress", asyncHandler(BatchController.progress));

router.post("/", requireRole(...ADMIN_ROLES), asyncHandler(BatchController.create));
router.post(
  "/import-users",
  requireRole(...ADMIN_ROLES),
  asyncHandler(BatchController.importUsers)
);
router.post(
  "/:id/status",
  requireRole(...OPERATOR_ROLES),
  asyncHandler(BatchController.setStatus)
);

export default router;
