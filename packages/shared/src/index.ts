/** Internal, unauthenticated health endpoint mounted by every service. */
export const INTERNAL_HEALTH_PATH = "/internal/health";

export * from "./types/verification.js";
export * from "./types/internal.js";

/** Product name used in logs and health payloads. */
export const APP_NAME = "DiscordDam";

/** Security audit event types — mirrored by the audit_log DB CHECK. */
export { AuditEventType } from "./types/audit.js";

/** Typed token errors — thrown by jwtService, caught by auth middleware. */
export {
  TokenBlacklistedError,
  TokenExpiredError,
  InvalidTokenError,
} from "./errors/tokenErrors.js";
