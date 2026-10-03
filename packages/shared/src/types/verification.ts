/**
 * Result of verifying a Discord user's membership in the target guild.
 */
export interface VerificationResult {
  /** Whether the user is currently a member of the target guild. */
  isMember: boolean;
  /** Role IDs the user holds in the target guild (empty when not a member). */
  roles: string[];
  /** When the membership was last verified. */
  verifiedAt: Date;
}

/**
 * The bot's internal verify endpoint failed — non-401 HTTP error, network
 * error, or timeout. `statusCode` is the HTTP status, or 0 when no response
 * was received (network/timeout).
 */
export class GuildVerificationError extends Error {
  public readonly statusCode: number;

  /**
   * @param statusCode HTTP status from the bot, or 0 for network errors/timeouts.
   * @param message Optional human-readable detail.
   */
  constructor(statusCode: number, message?: string) {
    super(message ?? `Guild verification failed (status ${statusCode})`);
    this.name = "GuildVerificationError";
    this.statusCode = statusCode;
  }
}

/** The bot's internal endpoint rejected the shared secret (HTTP 401). */
export class UnauthorizedInternalCallError extends Error {
  constructor(message?: string) {
    super(message ?? "Internal call rejected: missing or invalid x-internal-secret");
    this.name = "UnauthorizedInternalCallError";
  }
}