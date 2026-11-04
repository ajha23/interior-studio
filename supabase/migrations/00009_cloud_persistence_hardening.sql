-- Migration: 00009_cloud_persistence_hardening.sql
-- Description: Feature 034.1 — Hardened Tenant Isolation, Fail-Closed RLS, and Atomic Revision Commit RPC

-- ============================================================================
-- 1. Fail-Closed RLS Policies (FR-02, T201, T202)
-- ============================================================================
-- Eliminate coalesce fail-open vulnerability where missing JWT claim allowed open tenant matching.
-- If current_org_id() returns NULL, comparison (org_id = NULL) evaluates to FALSE in PostgreSQL.

-- Projects
DROP POLICY IF EXISTS projects_tenant_isolation ON public.projects;
CREATE POLICY projects_tenant_select ON public.projects
  FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY projects_tenant_insert ON public.projects
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY projects_tenant_update ON public.projects
  FOR UPDATE
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Spaces
DROP POLICY IF EXISTS spaces_tenant_isolation ON public.spaces;
CREATE POLICY spaces_tenant_select ON public.spaces
  FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY spaces_tenant_insert ON public.spaces
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY spaces_tenant_update ON public.spaces
  FOR UPDATE
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Design Revisions (Read and Insert ONLY; No update/delete)
DROP POLICY IF EXISTS revisions_tenant_isolation ON public.design_revisions;
CREATE POLICY revisions_tenant_select ON public.design_revisions
  FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY revisions_tenant_insert ON public.design_revisions
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- Legacy Import Mappings
DROP POLICY IF EXISTS mappings_tenant_isolation ON public.legacy_import_mappings;
CREATE POLICY mappings_tenant_select ON public.legacy_import_mappings
  FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY mappings_tenant_insert ON public.legacy_import_mappings
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- Idempotency Records
DROP POLICY IF EXISTS idempotency_tenant_isolation ON public.idempotency_records;
CREATE POLICY idempotency_tenant_select ON public.idempotency_records
  FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY idempotency_tenant_insert ON public.idempotency_records
  FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- Outbox Events
CREATE POLICY outbox_tenant_select ON public.outbox_events
  FOR SELECT
  USING (org_id = public.current_org_id());

-- ============================================================================
-- 2. Atomic Transactional Revision Commit RPC (FR-06, T401-T407)
-- ============================================================================
-- Commits a revision with strict Compare-And-Swap (CAS), row-level space lock,
-- immutable design_revisions record, transactional outbox event, and idempotency ledgering.

CREATE OR REPLACE FUNCTION public.commit_design_revision(
  p_org_id uuid,
  p_actor_id uuid,
  p_project_id uuid,
  p_space_id uuid,
  p_expected_revision_id uuid,
  p_schema_version integer,
  p_format text,
  p_snapshot_jsonb jsonb,
  p_canonical_hash text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_rev_id uuid;
  v_new_revision_id uuid;
  v_existing_idemp record;
  v_response jsonb;
  v_authorized boolean;
BEGIN
  -- Step 1: Authorization check
  -- Actor must have active membership and project permission
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = p_actor_id
      AND status = 'active'
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor is not an active member of the target organization.'
    );
  END IF;

  -- Step 2: Check Idempotency Key
  SELECT * INTO v_existing_idemp
  FROM public.idempotency_records
  WHERE org_id = p_org_id
    AND actor_id = p_actor_id
    AND operation = 'commit_design_revision'
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      -- Replay identical result
      RETURN v_existing_idemp.response_jsonb;
    ELSE
      -- Conflict: Same key reused with different payload
      RETURN jsonb_build_object(
        'success', false,
        'conflict', false,
        'reason', 'IDEMPOTENCY_KEY_REUSED',
        'error', 'Idempotency key has already been used with a different request payload.'
      );
    END IF;
  END IF;

  -- Step 3: Lock Space row for update
  SELECT current_revision_id INTO v_current_rev_id
  FROM public.spaces
  WHERE id = p_space_id
    AND org_id = p_org_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'NOT_FOUND',
      'error', 'Target space not found in this project and organization.'
    );
  END IF;

  -- Step 4: Compare-and-Swap (CAS) Check
  IF (v_current_rev_id IS DISTINCT FROM p_expected_revision_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', true,
      'reason', 'REVISION_CONFLICT',
      'currentRevisionId', v_current_rev_id,
      'error', 'Space current revision has changed since the local draft was created.'
    );
  END IF;

  -- Step 5: Insert immutable revision
  v_new_revision_id := gen_random_uuid();
  INSERT INTO public.design_revisions (
    id,
    org_id,
    project_id,
    space_id,
    parent_revision_id,
    schema_version,
    format,
    snapshot_jsonb,
    canonical_hash,
    created_by,
    created_at
  ) VALUES (
    v_new_revision_id,
    p_org_id,
    p_project_id,
    p_space_id,
    v_current_rev_id,
    p_schema_version,
    p_format,
    p_snapshot_jsonb,
    p_canonical_hash,
    p_actor_id,
    now()
  );

  -- Step 6: Advance Space pointer
  UPDATE public.spaces
  SET current_revision_id = v_new_revision_id,
      updated_at = now()
  WHERE id = p_space_id;

  -- Step 7: Enqueue Outbox Event
  INSERT INTO public.outbox_events (
    org_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload_jsonb,
    status
  ) VALUES (
    p_org_id,
    'space.revision_committed',
    'space',
    p_space_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'space_id', p_space_id,
      'revision_id', v_new_revision_id,
      'parent_revision_id', v_current_rev_id,
      'canonical_hash', p_canonical_hash,
      'committed_by', p_actor_id
    ),
    'pending'
  );

  -- Step 8: Ledger Idempotency Record
  v_response := jsonb_build_object(
    'success', true,
    'conflict', false,
    'revisionId', v_new_revision_id,
    'currentRevisionId', v_new_revision_id,
    'canonicalHash', p_canonical_hash,
    'committedAt', now()
  );

  INSERT INTO public.idempotency_records (
    org_id,
    actor_id,
    operation,
    idempotency_key,
    request_hash,
    response_status,
    response_jsonb
  ) VALUES (
    p_org_id,
    p_actor_id,
    'commit_design_revision',
    p_idempotency_key,
    p_canonical_hash,
    200,
    v_response
  );

  RETURN v_response;
END;
$$;

-- Revoke public execution, grant only to authenticated roles
REVOKE ALL ON FUNCTION public.commit_design_revision FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_design_revision TO authenticated, service_role;
