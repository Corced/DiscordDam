/**
 * Structured JSON logger — one JSON object per line on stdout.
 * Mirrors `packages/auth-server/src/utils/logger.ts` until it is hoisted.
 */
// ponytail: duplicate of auth-server's logger; hoist to @DiscordDam/shared
// on next touch (this is the 4th consumer) instead of keeping two copies.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

type LogLevel = keyof typeof LEVELS;

/** Arbitrary structured metadata attached to a log line. */
export type LogMeta = Record<string, unknown>;

const configured = process.env.LOG_LEVEL as LogLevel | undefined;
const activeLevel: number =
  configured !== undefined && configured in LEVELS ? LEVELS[configured] : LEVELS.info;

/** Flatten Error instances so they survive JSON.stringify. */
function serializeMeta(meta: LogMeta | undefined): LogMeta {
  if (meta === undefined) return {};
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return out;
}

/** Write a single JSON log line if `level` passes the LOG_LEVEL filter. */
function write(level: LogLevel, message: string, meta?: LogMeta): void {
  if (LEVELS[level] < activeLevel) return;
  const line = { timestamp: new Date().toISOString(), level, message, ...serializeMeta(meta) };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  /** Log at debug level. */
  debug: (message: string, meta?: LogMeta): void => write("debug", message, meta),
  /** Log at info level. */
  info: (message: string, meta?: LogMeta): void => write("info", message, meta),
  /** Log at warn level. */
  warn: (message: string, meta?: LogMeta): void => write("warn", message, meta),
  /** Log at error level. */
  error: (message: string, meta?: LogMeta): void => write("error", message, meta),
};

/** Human-readable message for an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
