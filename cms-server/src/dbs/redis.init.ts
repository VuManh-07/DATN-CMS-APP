"use strict";

import { createClient } from "redis";
import configEnv from "../configs/config.env";

// Build a well-formed redis URL. Auth is only included when credentials are
// actually set, so a local password-less Redis still connects.
const { host, port, username, password } = configEnv.redis;
const auth = password
  ? `${encodeURIComponent(username || "default")}:${encodeURIComponent(password)}@`
  : "";
const connectStr = `redis://${auth}${host}:${port}`;

let instanceConnectRedis;
let connectTimeOut: NodeJS.Timeout | null = null;
const statusConnectRedis = {
  CONNECT: "connect",
  END: "end",
  RECONNECT: "reconnecting",
  ERROR: "error",
};

const REDIS_CONNECT_TIMEOUT = 10000;

/**
 * Report a stalled reconnect.
 *
 * The original demo threw from inside this timer. A throw from a timer
 * callback cannot be caught by any caller and takes the whole process down —
 * so losing Redis would kill the server instead of degrading it. Redis only
 * holds live SCP03 sessions here, and every other CMS feature works without
 * it, so this now logs and lets the client keep retrying.
 */
const handleTimeoutError = (): void => {
  if (connectTimeOut) {
    clearTimeout(connectTimeOut);
  }
  connectTimeOut = setTimeout(() => {
    console.error(
      "[redis] still not connected after " +
        `${REDIS_CONNECT_TIMEOUT}ms — SCP03 card sessions are unavailable ` +
        "until Redis comes back"
    );
    connectTimeOut = null;
  }, REDIS_CONNECT_TIMEOUT);
};

const clearConnectTimeout = (): void => {
  if (connectTimeOut) {
    clearTimeout(connectTimeOut);
    connectTimeOut = null;
  }
};

const handleEventConnection = (connectRedis): void => {
  console.log("handle even");
  connectRedis.on(statusConnectRedis.CONNECT, async () => {
    console.log("connect redis - Connect status: connected");
    clearConnectTimeout();
  });

  connectRedis.on(statusConnectRedis.END, () => {
    console.log("connect redis - Connect status: disconnect");
    clearConnectTimeout();
  });

  connectRedis.on(statusConnectRedis.RECONNECT, () => {
    console.log("connect redis - Connect status: reconnecting");

    // connect retry
    handleTimeoutError();
  });

  connectRedis.on(statusConnectRedis.ERROR, () => {
    console.log(`connect redis - Connect status: error`);
  });
};

const initRedis = async () => {
  const instance = createClient({
    url: connectStr,
    socket: {
      // Give up after a handful of attempts instead of retrying forever, so
      // a dev machine with no Redis produces a few lines and then goes quiet.
      reconnectStrategy: (retries) =>
        retries > 5 ? false : Math.min(retries * 500, 3000),
    },
  });
  // node-redis emits "error" on every failed attempt; without a listener that
  // becomes an unhandled 'error' event and crashes the process.
  instance.on("error", () => undefined);

  handleEventConnection(instance);
  await instance.connect();
  instanceConnectRedis = instance;
};

const getRedis = () => {
  if (!instanceConnectRedis) {
    throw new Error("Redis connection needs to be open.");
  }
  return { instanceConnectRedis };
};

const closeRedis = async () => {
  if (instanceConnectRedis) {
    instanceConnectRedis.disconnect();
  }
  clearConnectTimeout();
};

export { initRedis, getRedis, closeRedis };
