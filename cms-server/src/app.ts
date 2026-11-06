import express, { Express, Request, Response, NextFunction } from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";

import router from "./routes";
import { applyDnsServers } from "./helpers/dnsConfig";
import { initRedis } from "./dbs/redis.init";
import config from "./configs/config.env";

dotenv.config();

const app: Express = express();

// init middlewares
app.use(cors());
app.use(morgan(config.env === "pro" ? "combined" : "dev"));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// init db — DNS first, since a mongodb+srv:// URL needs SRV lookups to work
applyDnsServers();
require("./dbs/mongodb.init");
initRedis().catch((err) =>
  console.error("[cms-server] redis init failed:", err.message)
);

// init routes
app.use("/api/v1", router);

app.get("/health", (req, res) => {
  res.json({ status: "ok", env: config.env, at: new Date().toISOString() });
});

// 404
app.use((req, res, next) => {
  const error: any = new Error(`Not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// error handler — never leak stack traces outside dev
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error("[cms-server]", error);
  }
  return res.status(status).json({
    status: "error",
    code: status,
    message: error?.message || "Internal Server Error",
    ...(config.env === "dev" ? { stack: error?.stack } : {}),
  });
});

export default app;
