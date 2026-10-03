/**
 * Typed errors for token verification failures. Thrown by JWTService and
 * (later) auth middleware — catch by instanceof, never by message string.
 */

/** Access/refresh token has passed its exp claim. */
export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

/** Signature invalid, malformed token, or wrong token type. */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/** Valid token whose jti was revoked (blacklisted) before expiry. */
export class TokenBlacklistedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenBlacklistedError";
  }
}