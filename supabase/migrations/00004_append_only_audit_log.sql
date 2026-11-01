-- Migration: 00004_append_only_audit_log.sql
-- Description: SEC-06, SEC-07 Append-only immutable audit_log with tamper prevention

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  event_family text NOT NULL, -- e.g. 'auth', 'members', 'clients', 'quotes', 'production', 'commercial', 'share_links'
  event_action text NOT NULL, -- e.g. 'cutlist_downloaded', 'pii_viewed'
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create BRIN index on created_at for ultra-fast time-series queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_brin 
  ON public.audit_log USING BRIN (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_actor 
  ON public.audit_log (org_id, actor_id);

-- Create default partition
CREATE TABLE IF NOT EXISTS public.audit_log_default 
  PARTITION OF public.audit_log DEFAULT;

-- Prevent UPDATE, DELETE, TRUNCATE on audit_log via defensive trigger
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is strictly append-only. Modification or deletion is forbidden by DPDP and security policy.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.audit_log;
CREATE TRIGGER trg_prevent_audit_log_mutation
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Revoke mutation privileges
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM PUBLIC, authenticated;

