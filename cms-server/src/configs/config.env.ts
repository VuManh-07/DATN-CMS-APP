import dotenv from "dotenv";

dotenv.config();

const dev = {
  app: {
    port: Number(process.env.DEV_APP_PORT) || 1255,
  },
  mongodb: {
    url: process.env.DEV_MONGODB_URL_CONNECT || "mongodb://localhost:27017",
    name: process.env.DEV_MONGODB_NAME || "cmsDB",
  },
  redis: {
    host: process.env.DEV_REDIS_HOST || "localhost",
    port: Number(process.env.DEV_REDIS_PORT) || 6379,
    username: process.env.DEV_REDIS_USERNAME || "",
    password: process.env.DEV_REDIS_PASSWORD || "",
  },
};

const pro = {
  app: {
    port: Number(process.env.PRO_APP_PORT) || 1255,
  },
  mongodb: {
    url: process.env.PRO_MONGODB_URL_CONNECT,
    name: process.env.PRO_MONGODB_NAME || "cmsDB",
  },
  redis: {
    host: process.env.PRO_REDIS_HOST,
    port: Number(process.env.PRO_REDIS_PORT) || 6379,
    username: process.env.PRO_REDIS_USERNAME || "",
    password: process.env.PRO_REDIS_PASSWORD || "",
  },
};

const env = process.env.NODE_ENV || "dev";
const base = { dev, pro }[env] || dev;

/**
 * Compose the full MongoDB connection URI.
 *
 * Naive `url + "/" + name` concatenation (what the original demo did) breaks on
 * the two shapes Atlas actually hands you:
 *
 *   mongodb+srv://u:p@host.mongodb.net/          â†’ double slash before the name
 *   mongodb+srv://u:p@host/?retryWrites=true     â†’ name lands after the query
 *
 * The database name belongs between the host and the query string, so build it
 * there and leave any options intact.
 */
export const buildMongoUri = (url: string, name: string): string => {
  if (!url) throw new Error("MongoDB URL is not configured");

  const queryStart = url.indexOf("?");
  const base = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? "" : url.slice(queryStart);

  // Drop any path already present (a trailing "/" or an existing db name) so
  // the configured name always wins.
  const schemeEnd = base.indexOf("://");
  const afterScheme = schemeEnd === -1 ? 0 : schemeEnd + 3;
  const pathStart = base.indexOf("/", afterScheme);
  const hostPart = pathStart === -1 ? base : base.slice(0, pathStart);

  return `${hostPart}/${name}${query}`;
};

/**
 * Secrets are read straight from the environment and never written to a
 * committed file. `.env.example` documents the shape; `.env` is gitignored.
 */
const config = {
  ...base,
  env,
  /** Full connection URI, safe for both plain and SRV/Atlas URLs. */
  mongoUri: buildMongoUri(base.mongodb.url, base.mongodb.name),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    accessTtl: process.env.JWT_ACCESS_TTL || "2h",
    refreshTtl: process.env.JWT_REFRESH_TTL || "7d",
  },
  kek: {
    hex:
      process.env.KEK_HEX ||
      "",
  },
  scp03: {
    sessionTtlSeconds: Number(process.env.SCP03_SESSION_TTL_SECONDS) || 900,
  },
  seed: {
    username: process.env.SEED_ADMIN_USERNAME || "admin",
    password: process.env.SEED_ADMIN_PASSWORD || "",
  },
};

export default config;

