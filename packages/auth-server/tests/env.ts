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

// Test-only defaults that satisfy the zod schema in authConfig.
// Config tells you exactly what's missing — extend until it imports cleanly.
process.env.JWT_SECRET ??= "test-jwt-secret-64-characters-long-for-testing-purposes-only";
process.env.BOT_INTERNAL_SECRET ??= "test-internal-secret-64-characters-long-for-testing-purposes";
process.env.DISCORD_CLIENT_ID ??= "123456789012345678";
process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret-at-least-30-characters-long";
process.env.DISCORD_REDIRECT_URI ??= "http://localhost:3001/auth/discord/callback";
process.env.TARGET_GUILD_ID ??= "123456789012345678";
process.env.SITE_URL ??= "http://localhost:3000";
process.env.AUTH_SERVER_INTERNAL_URL ??= "http://localhost:3001";
process.env.BOT_INTERNAL_URL ??= "http://localhost:3002";
process.env.DISCORD_INVITE_LINK ??= "https://discord.gg/example";
process.env.PORT ??= "3001";