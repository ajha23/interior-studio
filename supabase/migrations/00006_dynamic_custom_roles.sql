-- Migration: 00006_dynamic_custom_roles.sql
-- Description: Implement dynamic custom roles, granular module permissions, resource scopes, and scoped authorize() function

-- 1. Extend Roles Table for Tenant Custom Roles & System Immutability
ALTER TABLE public.roles 
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_system_role boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Mark default system roles as immutable global templates
UPDATE public.roles 
SET is_system_role = true, org_id = NULL 
WHERE id IN ('owner', 'admin', 'designer', 'production', 'viewer');

CREATE INDEX IF NOT EXISTS idx_roles_org_id ON public.roles(org_id);

-- 2. Prevent mutation or deletion of immutable system roles
CREATE OR REPLACE FUNCTION public.prevent_system_role_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system_role = true THEN
    RAISE EXCEPTION 'Default system role "%" is an immutable template and cannot be modified or deleted.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_system_role_mutation ON public.roles;
CREATE TRIGGER trg_prevent_system_role_mutation
  BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_role_mutation();

-- 3. Extend Role Permissions with Resource Scope
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'all_projects' 
    CHECK (scope_type IN ('all_projects', 'assigned_projects', 'team_projects', 'client_projects'));

-- 4. Project Membership Junction for Scoped Authorization
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id, project_id);

-- 5. Additive Union Scoped authorize() Security Definer Function (FR-005, FR-006, FR-007)
CREATE OR REPLACE FUNCTION public.authorize(p_org_id uuid, p_permission text, p_project_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.org_members m
    JOIN public.roles r ON r.id = m.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND rp.permission_id = p_permission
      AND (
        -- Additive union: any matching scope allows access
        rp.scope_type = 'all_projects'
        OR (
          rp.scope_type = 'assigned_projects' 
          AND (
            p_project_id IS NULL 
            OR EXISTS (
              SELECT 1 FROM public.project_members pm 
              WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.authorize(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize(uuid, text, uuid) TO authenticated;

-- Maintain backward-compatible 2-argument signature
CREATE OR REPLACE FUNCTION public.authorize(p_org_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.authorize(p_org_id, p_permission, NULL::uuid);
$$;

REVOKE ALL ON FUNCTION public.authorize(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize(uuid, text) TO authenticated;
