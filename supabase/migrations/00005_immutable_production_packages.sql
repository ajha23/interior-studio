-- Migration: 00005_immutable_production_packages.sql
-- Description: ARC-02, ARC-04, MFG-02 Immutable production packages with SHA-256 canonical hashing and tamper prevention

CREATE TABLE IF NOT EXISTS public.production_packages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  revision text NOT NULL,
  canonical_hash text NOT NULL, -- 64-character hex SHA-256 digest
  rule_pack_id text NOT NULL,
  rule_pack_version text NOT NULL,
  rule_pack_status text NOT NULL CHECK (rule_pack_status IN ('provisional', 'designer_reviewed', 'factory_validated', 'production_approved')),
  package_payload jsonb NOT NULL, -- Canonical immutable snapshot: parts[], hardware[], edge_band_summary, stats
  generated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_packages_hash UNIQUE (org_id, project_id, canonical_hash)
);

-- Index for instant lookup by project and canonical hash
CREATE INDEX IF NOT EXISTS idx_production_packages_project_hash 
  ON public.production_packages (org_id, project_id, canonical_hash);

CREATE INDEX IF NOT EXISTS idx_production_packages_rulepack 
  ON public.production_packages (rule_pack_id, rule_pack_version, rule_pack_status);

-- GIN index for deep querying of parts and hardware inside JSONB
CREATE INDEX IF NOT EXISTS idx_production_packages_payload_gin 
  ON public.production_packages USING GIN (package_payload);

-- Prevent UPDATE or DELETE on production_packages (strictly immutable once created)
CREATE OR REPLACE FUNCTION public.prevent_production_package_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ARC-02 Violation: Production packages are strictly immutable. Modifying or deleting an approved production package is prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_production_package_mutation ON public.production_packages;
CREATE TRIGGER trg_prevent_production_package_mutation
  BEFORE UPDATE OR DELETE ON public.production_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_production_package_mutation();

-- Revoke mutation privileges from standard users
REVOKE UPDATE, DELETE, TRUNCATE ON public.production_packages FROM PUBLIC, authenticated;

-- Enable Row-Level Security
ALTER TABLE public.production_packages ENABLE ROW LEVEL SECURITY;

-- Tenants may only read production packages belonging to their organization
CREATE POLICY production_packages_org_isolation ON public.production_packages
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
