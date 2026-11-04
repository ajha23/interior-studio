-- Migration: 00008_canonical_projects_and_spaces.sql
-- Description: Feature 034 — Canonical SaaS Project Foundation, Spaces, Immutable Design Revisions, Legacy Mapping, and Idempotency Ledger

-- ============================================================================
-- 1. Client Table Uniqueness Precondition
-- ============================================================================
-- Add composite uniqueness on clients(id, org_id) to enable same-tenant foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_clients_id_org' AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients ADD CONSTRAINT uq_clients_id_org UNIQUE (id, org_id);
  END IF;
END $$;

-- ============================================================================
-- 2. Canonical Projects Table (T102, T103, T103a)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT uq_projects_id_org UNIQUE (id, org_id),
  CONSTRAINT fk_projects_client_tenant FOREIGN KEY (client_id, org_id) 
    REFERENCES public.clients(id, org_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_org_status ON public.projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(org_id, created_at DESC);

-- ============================================================================
-- 3. Canonical Spaces Table (T104)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  space_type text NOT NULL DEFAULT 'kitchen' 
    CHECK (space_type IN ('kitchen', 'bedroom', 'living', 'dining', 'bathroom', 'utility', 'office', 'other')),
  level integer NOT NULL DEFAULT 0,
  plan_x_mm integer NOT NULL DEFAULT 0,
  plan_z_mm integer NOT NULL DEFAULT 0,
  current_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_spaces_id_org_project UNIQUE (id, org_id, project_id),
  CONSTRAINT fk_spaces_project FOREIGN KEY (project_id, org_id) 
    REFERENCES public.projects(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spaces_project_level ON public.spaces(project_id, level);
CREATE INDEX IF NOT EXISTS idx_spaces_org ON public.spaces(org_id);

-- ============================================================================
-- 4. Immutable Design Revisions Table (T105, T106)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.design_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL,
  space_id uuid NOT NULL,
  parent_revision_id uuid,
  schema_version integer NOT NULL DEFAULT 2,
  format text NOT NULL DEFAULT 'interior-studio/kitchen',
  snapshot_jsonb jsonb NOT NULL,
  canonical_hash text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_design_revisions_id_space UNIQUE (id, space_id),
  CONSTRAINT fk_revisions_space FOREIGN KEY (space_id, org_id, project_id) 
    REFERENCES public.spaces(id, org_id, project_id) ON DELETE CASCADE,
  CONSTRAINT fk_revisions_parent FOREIGN KEY (parent_revision_id, space_id) 
    REFERENCES public.design_revisions(id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_revisions_space_created ON public.design_revisions(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_hash ON public.design_revisions(canonical_hash);
CREATE INDEX IF NOT EXISTS idx_revisions_org ON public.design_revisions(org_id);

-- Link spaces.current_revision_id deferred FK to design_revisions (T106)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_spaces_current_revision' AND conrelid = 'public.spaces'::regclass
  ) THEN
    ALTER TABLE public.spaces 
      ADD CONSTRAINT fk_spaces_current_revision 
      FOREIGN KEY (current_revision_id, id) 
      REFERENCES public.design_revisions(id, space_id) 
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Prevent updates or deletes to committed design revisions (FR-024)
CREATE OR REPLACE FUNCTION public.prevent_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Design revisions are immutable snapshots and cannot be updated or deleted (id: %).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_revision_mutation ON public.design_revisions;
CREATE TRIGGER trg_prevent_revision_mutation
  BEFORE UPDATE OR DELETE ON public.design_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_revision_mutation();

-- ============================================================================
-- 5. Repair Project Members Table (T107)
-- ============================================================================
DO $$
BEGIN
  -- Add org_id to project_members if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_members' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.project_members 
      ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- Add foreign key from project_members to projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_project_members_project' AND conrelid = 'public.project_members'::regclass
  ) THEN
    ALTER TABLE public.project_members 
      ADD CONSTRAINT fk_project_members_project 
      FOREIGN KEY (project_id) 
      REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 6. Legacy Import Mappings (T108)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.legacy_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_format text NOT NULL, -- e.g. 'interior-studio/kitchen', 'interior-studio/home'
  source_entity_type text NOT NULL, -- e.g. 'project', 'home', 'room'
  source_entity_id text NOT NULL,
  target_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  first_imported_revision_id uuid,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_legacy_import_mapping UNIQUE (org_id, source_format, source_entity_type, source_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_import_lookup 
  ON public.legacy_import_mappings(org_id, source_format, source_entity_id);

-- ============================================================================
-- 7. Idempotency Records Ledger (T109)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_jsonb jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_record UNIQUE (org_id, actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup 
  ON public.idempotency_records(org_id, actor_id, operation, idempotency_key);

-- ============================================================================
-- 8. Transactional Outbox Events (T110)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_jsonb jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending 
  ON public.outbox_events(status, created_at) 
  WHERE status = 'pending';

-- ============================================================================
-- 9. Row-Level Security (RLS) Configuration (FR-023, T309)
-- ============================================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- Helper to check verified current org
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.org_id', true), '')::uuid;
$$;

-- Projects RLS Policies
DROP POLICY IF EXISTS projects_tenant_isolation ON public.projects;
CREATE POLICY projects_tenant_isolation ON public.projects
  AS RESTRICTIVE
  FOR ALL
  USING (org_id = coalesce(public.current_org_id(), org_id))
  WITH CHECK (org_id = coalesce(public.current_org_id(), org_id));

DROP POLICY IF EXISTS spaces_tenant_isolation ON public.spaces;
CREATE POLICY spaces_tenant_isolation ON public.spaces
  AS RESTRICTIVE
  FOR ALL
  USING (org_id = coalesce(public.current_org_id(), org_id))
  WITH CHECK (org_id = coalesce(public.current_org_id(), org_id));

DROP POLICY IF EXISTS revisions_tenant_isolation ON public.design_revisions;
CREATE POLICY revisions_tenant_isolation ON public.design_revisions
  AS RESTRICTIVE
  FOR ALL
  USING (org_id = coalesce(public.current_org_id(), org_id))
  WITH CHECK (org_id = coalesce(public.current_org_id(), org_id));

DROP POLICY IF EXISTS mappings_tenant_isolation ON public.legacy_import_mappings;
CREATE POLICY mappings_tenant_isolation ON public.legacy_import_mappings
  AS RESTRICTIVE
  FOR ALL
  USING (org_id = coalesce(public.current_org_id(), org_id))
  WITH CHECK (org_id = coalesce(public.current_org_id(), org_id));

DROP POLICY IF EXISTS idempotency_tenant_isolation ON public.idempotency_records;
CREATE POLICY idempotency_tenant_isolation ON public.idempotency_records
  AS RESTRICTIVE
  FOR ALL
  USING (org_id = coalesce(public.current_org_id(), org_id))
  WITH CHECK (org_id = coalesce(public.current_org_id(), org_id));

-- ============================================================================
-- 10. Update Authorize Function for Assigned Projects Integrity (T304a, T305a, T306a)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.authorize(p_org_id uuid, p_permission text, p_project_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members om
    JOIN public.roles r ON r.id = om.role_id AND (r.org_id IS NULL OR r.org_id = p_org_id)
    JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.permission_id = p_permission
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND r.status = 'active'
      AND (
        -- Scope: all_projects grants organization-wide access
        rp.scope_type = 'all_projects'
        OR
        -- Scope: assigned_projects requires explicit project context AND membership
        (
          rp.scope_type = 'assigned_projects'
          AND p_project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id = auth.uid()
          )
        )
      )
  );
$$;
