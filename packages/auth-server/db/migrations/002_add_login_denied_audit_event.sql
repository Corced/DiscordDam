-- 002: allow LOGIN_DENIED in audit_log.event_type.
-- LOGIN_DENIED (shared AuditEventType) is emitted by routes/auth.ts to deny
-- REVOKED users distinctly from non-members; without this it violates
-- audit_event_type_allowed and auditRepository.log silently drops the row.
ALTER TABLE audit_log DROP CONSTRAINT audit_event_type_allowed;
ALTER TABLE audit_log ADD CONSTRAINT audit_event_type_allowed CHECK (event_type IN (
  'LOGIN_SUCCESS', 'LOGIN_DENIED_NOT_MEMBER', 'LOGIN_DENIED', 'TOKEN_REVOKED', 'TOKEN_REFRESHED',
  'MEMBER_LEFT_GUILD', 'MEMBER_BANNED', 'MANUAL_REVOKE', 'TOKEN_BLACKLISTED'
));