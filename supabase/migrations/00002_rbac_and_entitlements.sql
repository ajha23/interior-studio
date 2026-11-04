-- Migration: 00002_rbac_and_entitlements.sql
-- Description: SEC-01, RBAC-01..05, ENT-01 Data-driven RBAC & authorize() function

-- 1. Create Core Tables
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id text PRIMARY KEY,
  rank integer NOT NULL,
  description text NOT NULL
);

-- Seed standard roles
INSERT INTO public.roles (id, rank, description) VALUES
  ('owner', 100, 'Full administrative and billing access. Can manage members, billing and destroy org.'),
  ('admin', 80, 'Full studio access: projects, catalogue, margins, quotes, and team settings.'),
  ('designer', 60, 'Design and edit projects, create presentations and quotes (cannot edit base margins).'),
  ('production', 40, 'Workshop access: generate cut lists, view technical drawings and schedules (no client PII or margins).'),
  ('viewer', 20, 'Read-only access to designs and presentations.')
ON CONFLICT (id) DO UPDATE SET rank = EXCLUDED.rank, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.permissions (
  id text PRIMARY KEY,
  category text NOT NULL,
  description text NOT NULL
);

-- Seed permissions
INSERT INTO public.permissions (id, category, description) VALUES
  ('org:manage', 'org', 'Manage organization settings and billing'),
  ('members:manage', 'org', 'Invite, update, or remove members'),
  ('projects:read', 'projects', 'View project designs and sheets'),
  ('projects:write', 'projects', 'Create and edit designs'),
  ('projects:delete', 'projects', 'Delete projects'),
  ('quotes:view_costs', 'commercial', 'View factory production costs and cost-down suggestions'),
  ('quotes:edit_margins', 'commercial', 'Edit margin percentages and client markups'),
  ('quotes:send', 'commercial', 'Generate and send official quotes to clients'),
  ('production:download_cutlist', 'production', 'Download factory OptiCut/Cut Rite CSV cut lists and CNC packages'),
  ('clients:view_pii', 'clients', 'View unmasked client phone, email and personal details'),
  ('clients:manage', 'clients', 'Create and edit client profiles and consent records')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id text REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id text REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Seed role-permission assignments
-- Owner: everything
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'owner', id FROM public.permissions
ON CONFLICT DO NOTHING;

-- Admin: all except destroying org
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'admin', id FROM public.permissions
WHERE id != 'org:manage'
ON CONFLICT DO NOTHING;

-- Designer: projects, quotes:send, clients:view_pii
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  ('designer', 'projects:read'),
  ('designer', 'projects:write'),
  ('designer', 'quotes:send'),
  ('designer', 'clients:view_pii'),
  ('designer', 'clients:manage')
ON CONFLICT DO NOTHING;

-- Production: projects:read, production:download_cutlist (NO PII, NO COST/MARGIN)
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  ('production', 'projects:read'),
  ('production', 'production:download_cutlist')
ON CONFLICT DO NOTHING;

-- Viewer: projects:read only
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  ('viewer', 'projects:read')
ON CONFLICT DO NOTHING;

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_id text NOT NULL REFERENCES public.roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_org 
  ON public.org_members (user_id, org_id);

-- 3. Last-Owner Protection Trigger (RBAC-04)
CREATE OR REPLACE FUNCTION public.check_last_owner_protection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_count integer;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role_id = 'owner') OR 
     (TG_OP = 'UPDATE' AND OLD.role_id = 'owner' AND NEW.role_id != 'owner') THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.org_members
    WHERE org_id = OLD.org_id AND role_id = 'owner' AND id != OLD.id;

    IF v_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove or demote the last owner of an organization';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_last_owner_protection ON public.org_members;
CREATE TRIGGER trg_last_owner_protection
  BEFORE UPDATE OR DELETE ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.check_last_owner_protection();

-- 4. Authorize RPC (SEC-01, RBAC-02)
CREATE OR REPLACE FUNCTION public.authorize(p_org_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.org_members m
    JOIN public.role_permissions rp ON rp.role_id = m.role_id
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND rp.permission_id = p_permission
  );
$$;

REVOKE ALL ON FUNCTION public.authorize(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize(uuid, text) TO authenticated;

-- Helper: org_can_write
CREATE OR REPLACE FUNCTION public.org_can_write(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.authorize(p_org_id, 'projects:write');
$$;

REVOKE ALL ON FUNCTION public.org_can_write(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_can_write(uuid) TO authenticated;

