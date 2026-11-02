"use strict";

import { Router } from "express";
import { asyncHandler } from "../../helpers/asyncHandler";
import { authenticate } from "../../auth/checkAuth";
import AuthController from "../../controllers/auth.controller";

const router = Router();

// public
router.post("/login", asyncHandler(AuthController.login));
router.post("/refresh", asyncHandler(AuthController.refresh));

// authenticated
router.use(authenticate);
router.post("/logout", asyncHandler(AuthController.logout));
router.get("/me", asyncHandler(AuthController.me));

export default router;
