-- Migration: 00003_dpdp_clients_and_consents.sql
-- Description: SEC-05, DP-01, DP-02 DPDP Act 2023 compliance, clients, consents, clients_safe view

-- 1. Consents Ledger
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notice_version text NOT NULL DEFAULT 'v1.0',
  purpose text NOT NULL, -- e.g. 'interior_design_and_production'
  ip_address text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consents_org_id ON public.consents(org_id);

-- 2. Clients Entity (Separated from projects)
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  mobile text NOT NULL,
  email text,
  site_address text,
  gstin text,
  consent_id uuid REFERENCES public.consents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(org_id);

-- Link projects table to client if projects exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'projects' AND column_name = 'client_id'
    ) THEN
      ALTER TABLE public.projects ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
    END IF;
  END IF;
END $$;

-- 3. Masking Helpers
CREATE OR REPLACE FUNCTION public.mask_mobile(p_mobile text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_mobile IS NULL OR length(p_mobile) < 4 THEN '**********'
    ELSE substring(p_mobile from 1 for 2) || repeat('*', greatest(length(p_mobile) - 4, 2)) || substring(p_mobile from length(p_mobile) - 1 for 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_email IS NULL OR position('@' in p_email) < 2 THEN '***@***.com'
    ELSE substring(p_email from 1 for 1) || '***' || substring(p_email from position('@' in p_email) - 1 for 1) || substring(p_email from position('@' in p_email))
  END;
$$;

-- 4. Secure View with Field-Level Masking (DP-01, RBAC-09, SEC-05)
CREATE OR REPLACE VIEW public.clients_safe
WITH (security_invoker = true)
AS
SELECT 
  c.id,
  c.org_id,
  c.name,
  CASE 
    WHEN public.authorize(c.org_id, 'clients:view_pii') THEN c.mobile
    ELSE public.mask_mobile(c.mobile)
  END AS mobile,
  CASE 
    WHEN public.authorize(c.org_id, 'clients:view_pii') THEN c.email
    ELSE public.mask_email(c.email)
  END AS email,
  CASE 
    WHEN public.authorize(c.org_id, 'clients:view_pii') THEN c.site_address
    ELSE '[Protected Site Address]'
  END AS site_address,
  c.gstin,
  c.consent_id,
  c.created_at,
  c.updated_at
FROM public.clients c;

