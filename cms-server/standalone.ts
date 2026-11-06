/**
 * Zero-install dev server.
 *
 *   yarn dev:standalone
 *
 * Boots an in-memory MongoDB, seeds demo data, then starts the normal app, so
 * the whole CMS UI is explorable on a machine with no MongoDB, Redis or Docker
 * installed.
 *
 * Caveats, by design:
 *  - Data is discarded when the process exits.
 *  - Redis is not started. Only live SCP03 card sessions need it, and those
 *    need a physical reader anyway; everything else degrades cleanly.
 *
 * The in-memory server's URL has to be in the environment *before* any module
 * that reads config is loaded, which is why app/mongoose are pulled in with
 * require() further down rather than imported at the top.
 */

import { MongoMemoryServer } from "mongodb-memory-server";

const DB_NAME = "cmsDemoDB";

const main = async () => {
  console.log("[standalone] starting in-memory MongoDB (first run downloads it)…");
  const mongo = await MongoMemoryServer.create({
    instance: { dbName: DB_NAME },
  });

  const uri = mongo.getUri();
  // getUri() includes a trailing database path; config appends its own, so
  // hand over just the host part.
  const baseUri = uri.replace(/\/[^/]*$/, "");

  process.env.NODE_ENV = "dev";
  process.env.DEV_MONGODB_URL_CONNECT = baseUri;
  process.env.DEV_MONGODB_NAME = DB_NAME;
  console.log(`[standalone] MongoDB ready at ${baseUri}/${DB_NAME}`);

  // Loaded only now, so config.env picks up the values set above.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongoose = require("mongoose");
  await mongoose.connect(`${baseUri}/${DB_NAME}`);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { seedDemo } = require("./src/scripts/seedDemo");
  await seedDemo();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require("./src/configs/config.env").default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require("./src/app").default;

  const port = config.app.port;
  const server = app.listen(port, () => {
    console.log("");
    console.log(`  CMS server (standalone) → http://localhost:${port}`);
    console.log(`  Health check            → http://localhost:${port}/health`);
    console.log("");
    console.log("  Sign in with any of:");
    console.log("    admin    / 123@   (SUPER_ADMIN — full access)");
    console.log("    manager  / 123@   (ADMIN)");
    console.log("    operator / 123@   (OPERATOR)");
    console.log("    auditor  / 123@   (AUDITOR — read-only)");
    console.log("");
    console.log("  Data lives in memory and is discarded on exit.");
    console.log("");
  });

  const shutdown = async () => {
    console.log("\n[standalone] shutting down");
    server.close();
    await mongoose.disconnect().catch(() => undefined);
    await mongo.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("[standalone] failed to start:", err);
  process.exit(1);
});
