/**
 * Structured JSON-lines logger — one line per event, grep- and parse-friendly.
 * Extracted from the local copies in db/pool.ts and services/redisService.ts
 * (this file is the third consumer that triggered the extraction).
 */
export const logger = {
  info(msg: string): void {
    console.info(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg }));
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...extra }));
  },
  error(msg: string, err?: unknown): void {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  },
};