"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import { authenticate, requireRole } from "../../auth/checkAuth";
import { AdminRole } from "../../types/enums";
import KeySetController from "../../controllers/keySet.controller";

const router = Router();
router.use(authenticate, requireRole());

router.get("/", asyncHandler(KeySetController.list));
router.get("/:id", asyncHandler(KeySetController.detail));

// Key material is the crown jewels — SUPER_ADMIN only.
// requireRole always lets SUPER_ADMIN through, so an empty role list here
// means "SUPER_ADMIN and nobody else".
const superAdminOnly = requireRole();

router.post("/", superAdminOnly, asyncHandler(KeySetController.create));
router.post(
  "/:id/deprecate",
  superAdminOnly,
  asyncHandler(KeySetController.deprecate)
);
router.delete("/:id", superAdminOnly, asyncHandler(KeySetController.remove));

export default router;
