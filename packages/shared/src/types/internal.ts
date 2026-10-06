/**
 * Wire contract for the bot ⇄ auth-server internal API. Both services import
 * these types — the shapes cannot drift apart silently.
 */

/** Response body of `POST /internal/revoke-access`. */
export interface RevokeAccessResult {
  success: boolean;
  sessionsRevoked: number;
}

/** Response body of `GET /internal/users/:discordUserId`. */
export interface UserPublicProfile {
  id: string;
  discordUserId: string;
  username: string;
  role: "MEMBER" | "REVOKED";
  status: string;
  lastLogin: string | null;
  createdAt: string;
}

/** Response body of `GET /internal/health` (auth-server). */
export interface InternalHealthStatus {
  status: string;
  db: boolean;
  redis: boolean;
  timestamp: string;
}

/** Response body of `GET /internal/stats`. */
export interface UserApiStats {
  /** Total registered API users. */
  total: number;
  /** Users with ACTIVE status. */
  active: number;
  /** Users with REVOKED status. */
  revoked: number;
}

/** Response body of `GET /internal/users` (active user id list). */
export interface ActiveUserList {
  discordUserIds: string[];
}