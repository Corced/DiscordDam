import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { authConfig } from "@discordgate/shared/config/authConfig.js";

/** Single shared pg pool — one per process, sized for a small API service. */
export const pool = new pg.Pool({
  connectionString: authConfig.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

// Structured JSON lines — swap for a real logger module when one exists.
const log = (level: "warn" | "error", msg: string, extra: Record<string, unknown>): void => {
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
};

// Idle-client errors (network blips, DB restarts) surface here, never on a
// query call. Log and let the pool replace the client.
pool.on("error", (err: Error) => {
  log("error", "pg_pool_error", { err: err.message });
});

/**
 * Parameterized query helper. Any statement slower than 1s is logged
 * (SQL text only — parameter values never reach the logs).
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<R>> {
  const start = Date.now();
  const result = await pool.query<R>(text, params);
  const ms = Date.now() - start;
  if (ms > 1000) {
    log("warn", "slow_query", { ms, text });
  }
  return result;
}