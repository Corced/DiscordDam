/**
 * Structured JSON-lines logger — one line per event, grep- and parse-friendly.
 * Extracted from the local copies in db/pool.ts and services/redisService.ts
 * (this file is the third consumer that triggered the extraction).
 */
export const logger = {
  debug(msg: string, extra?: Record<string, unknown>): void {
    console.debug(JSON.stringify({ ts: new Date().toISOString(), level: "debug", msg, ...extra }));
  },
  info(msg: string, extra?: Record<string, unknown>): void {
    console.info(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg, ...extra }));
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...extra }));
  },
  error(msg: string, extra?: Record<string, unknown>): void {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg, ...extra }));
  },
};
