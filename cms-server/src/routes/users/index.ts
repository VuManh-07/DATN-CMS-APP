"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import { authenticate, requireRole, ADMIN_ROLES } from "../../auth/checkAuth";
import UserController from "../../controllers/user.controller";

const router = Router();
router.use(authenticate);

// Reading is open to any authenticated role (AUDITOR included).
router.get("/", asyncHandler(UserController.list));
router.get("/:id", asyncHandler(UserController.detail));

// Mutating cardholder data is an ADMIN concern.
router.post("/", requireRole(...ADMIN_ROLES), asyncHandler(UserController.create));
router.patch("/:id", requireRole(...ADMIN_ROLES), asyncHandler(UserController.update));

export default router;
