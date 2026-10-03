/**
 * Ambient Express request augmentation. Requires @types/express in scope and
 * this file to be covered by the tsconfig `include` (it lives under src/).
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by jwtGuard — undefined on unauthenticated requests. */
      user?: {
        discordId: string;
        username: string;
        role: "MEMBER";
        jti: string;
      };
      /** Set by requestLogger; absent on skipped paths (health). */
      requestId?: string;
    }
  }
}

export {};