"use strict";

/**
 * Create the bootstrap SUPER_ADMIN account.
 *
 *   yarn seed
 *
 * Credentials come from SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD. The script
 * is idempotent: if the account already exists it reports and exits without
 * touching the stored password.
 */

import mongoose from "mongoose";
import config from "../configs/config.env";
import { applyDnsServers } from "../helpers/dnsConfig";
import Admin from "../models/admin.model";
import authService from "../services/auth.service";
import { AdminRole, AccountStatus } from "../types/enums";

const run = async () => {
  applyDnsServers();
  await mongoose.connect(config.mongoUri);
  console.log(`[seed] connected to ${config.mongodb.name}`);

  const { username, password } = config.seed;

  const existing = await Admin.findOne({ username });
  if (existing) {
    console.log(`[seed] admin "${username}" already exists — nothing to do`);
  } else {
    await Admin.create({
      username,
      fullName: "Super Administrator",
      passwordHash: await authService.hashPassword(password),
      role: AdminRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
    });
    console.log(`[seed] created SUPER_ADMIN "${username}"`);
    if (password === "ChangeMe123!") {
      console.warn("[seed] WARNING: default password in use — change it now");
    }
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
