import type { RequestHandler } from "express";

/**
 * Factory for role-based route guards. MUST be chained after jwtGuard —
 * it reads the `req.user` jwtGuard populated.
 *
 * ADMIN role is unreachable via Discord OAuth — all Discord-authed users
 * are capped at MEMBER (enforced at JWT sign AND verify time).
 *
 * @param allowedRoles Roles permitted through this guard.
 */
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (req, res, next) => {
    if (req.user === undefined) {
      res.status(401).json({ error: "No token provided", code: "NO_TOKEN" });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}