/**
 * Canonical set of security-relevant audit events.
 *
 * Values are the exact strings stored in audit_log.event_type — keep in sync
 * with the audit_event_type_allowed CHECK in
 * packages/auth-server/src/db/schema.sql (the DB-level safety net).
 */
export enum AuditEventType {
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGIN_DENIED_NOT_MEMBER = "LOGIN_DENIED_NOT_MEMBER",
  TOKEN_REVOKED = "TOKEN_REVOKED",
  TOKEN_REFRESHED = "TOKEN_REFRESHED",
  MEMBER_LEFT_GUILD = "MEMBER_LEFT_GUILD",
  MEMBER_BANNED = "MEMBER_BANNED",
  MANUAL_REVOKE = "MANUAL_REVOKE",
  TOKEN_BLACKLISTED = "TOKEN_BLACKLISTED",
}