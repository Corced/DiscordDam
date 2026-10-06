import { beforeAll, beforeEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import type { Pool } from "pg";
import type Redis from "ioredis";
import { discordApiHandlers, resetMockState } from "./mocks/discordApi.js";
import { botServerHandlers } from "./mocks/botServer.js";

export const mswServer = setupServer(...discordApiHandlers, ...botServerHandlers);

// whitelist is Redis-only — no SQL table. TRUNCATE only real tables.
const TRUNCATE = "TRUNCATE users, sessions, audit_log RESTART IDENTITY CASCADE";

let app: Express | null = null;
let pool: Pool | null = null;
let redis: Redis | null = null;

import type { Express } from "express";

export const getApp = () => {
  if (!app) throw new Error("setup: app not initialised yet");
  return app;
};
export const getPool = () => {
  if (!pool) throw new Error("setup: pool not initialised yet");
  return pool;
};
export const getRedis = () => {
  if (!redis) throw new Error("setup: redis not initialised yet");
  return redis;
};

beforeAll(async () => {
  mswServer.listen({ onUnhandledRequest: "error" }); // unmocked egress = hard failure

  const { runMigrations } = await import("../src/db/migrate.js");
  await runMigrations(); // must be idempotent — runs once per test file

  const appModule = await import("../src/app.js");
  app = appModule.createApp();

  const poolModule = await import("../src/db/pool.js");
  pool = poolModule.pool;

  const redisModule = await import("../src/services/redisService.js");
  // redisService is a named export (singleton), access its private `redis` field for flushdb/quit
  redis = (redisModule.redisService as { redis: Redis }).redis;
});

beforeEach(async () => {
  resetMockState();
  await pool!.query(TRUNCATE);
  await redis!.flushdb();
});

afterAll(async () => {
  mswServer.close();
  await pool?.end();
  await redis?.quit();
});