// Runs FIRST — config validates at import time, so env must exist before any app module loads.
process.env.NODE_ENV = "test";

const dbUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!dbUrl) throw new Error("tests/env: DATABASE_URL (or DATABASE_URL_TEST) is required");
if (!new URL(dbUrl).pathname.toLowerCase().includes("test")) {
  throw new Error(`tests/env: refusing to run against a non-test database: ${dbUrl}`);
}
process.env.DATABASE_URL = dbUrl;

// Forced isolated logical DB — local dev can't point tests at dev data.
const redisBase = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL ?? "redis://localhost:6379";
const redisUrl = new URL(redisBase);
redisUrl.pathname = "/15";
process.env.REDIS_URL = redisUrl.toString();

// Test-only defaults (real env wins). Extend until crash-fast config stops complaining —
// it tells you exactly what's missing.
process.env.JWT_SECRET ??= "test-jwt-secret";           // ASSUMPTION env name
process.env.INTERNAL_SECRET ??= "test-internal-secret"; // ASSUMPTION env name
process.env.DISCORD_CLIENT_ID ??= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret";
process.env.DISCORD_REDIRECT_URI ??= "http://localhost:3000/auth/discord/callback";
process.env.TARGET_GUILD_ID ??= "test-guild-id";