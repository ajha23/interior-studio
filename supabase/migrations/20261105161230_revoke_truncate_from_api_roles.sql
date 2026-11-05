-- Spec 041, FR-011: the API roles must not hold TRUNCATE on any public table.
-- TRUNCATE ignores row-level security, so holding it would let a role empty a table outright.
-- The REST API never issues TRUNCATE, so this closes a latent gap; nothing in the app uses it.
-- Exposed by supabase/tests/03_roles.test.sql ("<role> cannot truncate <table>").

revoke truncate on all tables in schema public from anon, authenticated;

-- Tables created later by migrations (run as postgres) must not get it either.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
