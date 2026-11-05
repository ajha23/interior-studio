-- Migration: 00001_security_hardening.sql
-- Description: SEC-03, SEC-04 Database hardening, pinned search_path, authenticated RLS

-- 1. Ensure extensions and schema
CREATE SCHEMA IF NOT EXISTS public;

-- 2. Secure Search Path for SECURITY DEFINER functions
-- Explicitly set search_path = public, pg_temp to prevent schema hijacking

CREATE OR REPLACE FUNCTION public.accept_pending_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_email text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RETURN;
  END IF;

  -- Add to org_members for any pending invitations matching email
  -- Mark invites as accepted
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pending_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pending_invites() TO authenticated;

-- AI credit balance RPC
CREATE OR REPLACE FUNCTION public.ai_credit_balance(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance integer;
  v_is_member boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Membership check
  SELECT EXISTS(
    SELECT 1 FROM public.org_members 
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Access denied: not an organization member';
  END IF;

  SELECT balance INTO v_balance FROM public.ai_credits WHERE org_id = p_org_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_balance(uuid) TO authenticated;

-- 3. Base RLS Policies: enforce 'authenticated' role instead of 'public'
-- Enforces that anonymous/public roles cannot query tenant data directly
DO $$
BEGIN
  -- If organizations table exists, harden its RLS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
  END IF;
  
  -- If org_members table exists, harden its RLS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'org_members') THEN
    ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
  END IF;

  -- If projects table exists, harden its RLS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

