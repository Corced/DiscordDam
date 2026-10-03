import type { Request, RequestHandler } from "express";
import { jwtService } from "../services/jwtService.js";
import { redisService } from "../services/redisService.js";

/** Extract a well-formed `Bearer <token>` from the Authorization header. */
function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length);
  return token === "" ? undefined : token;
}

/**
 * Build a JWT authentication guard. Verifies the access token, rejects
 * blacklisted jtis, and populates `req.user`. Typed failures
 * (TokenExpiredError, InvalidTokenError) are forwarded via `next(err)` and
 * mapped to their 401 bodies centrally in errorHandler — never res.json()
 * in a catch block.
 *
 * @param required When true, a missing/malformed header is a 401; when
 *   false, headerless requests continue anonymously without `req.user`.
 */
function makeJwtGuard(required: boolean): RequestHandler {
  return async (req, res, next) => {
    const token = extractBearerToken(req);
    if (token === undefined) {
      if (required) {
        res.status(401).json({ error: "No token provided", code: "NO_TOKEN" });
        return;
      }
      next(); // anonymous — the route decides what unauthenticated users see
      return;
    }
    try {
      const payload = await jwtService.verifyAccessToken(token);
      if (await redisService.isBlacklisted(payload.jti)) {
        res.status(401).json({ error: "Token revoked", code: "TOKEN_REVOKED" });
        return;
      }
      // role is hard-capped: access tokens are signed AND re-verified as MEMBER.
      req.user = {
        discordId: payload.sub,
        username: payload.username,
        role: "MEMBER",
        jti: payload.jti,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Rejects requests without a valid, non-blacklisted access token. */
export const jwtGuard: RequestHandler = makeJwtGuard(true);

/** Authenticates when a token is present; passes through anonymously otherwise. */
export const optionalJwtGuard: RequestHandler = makeJwtGuard(false);