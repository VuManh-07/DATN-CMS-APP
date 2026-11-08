import config from "./src/configs/config.env";
import app from "./src/app";
import { closeRedis } from "./src/dbs/redis.init";
import { startExpiryJob, stopExpiryJob } from "./src/services/expiry.job";

const port = config.app.port;

const server = app.listen(port, () => {
  console.log(`[cms-server] listening on port ${port} (env=${config.env})`);
  startExpiryJob();
});

const shutdown = (signal: string) => {
  console.log(`[cms-server] ${signal} received, shutting down`);
  stopExpiryJob();
  server.close(async () => {
    await closeRedis();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default server;
