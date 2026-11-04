-- Migration: 00010_security_and_transactional_remediation.sql
-- Description: Feature 034.2 — Remediate SECURITY DEFINER identity spoofing, add project scoped RBAC, atomic audit events, and transactional imports

-- ============================================================================
-- 1. Append-Only Audit Events Table (FR-05, T202)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_target ON public.audit_events(org_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON public.audit_events(org_id, created_at DESC);

-- Append-only trigger: prohibit UPDATE or DELETE
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted (id: %).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON public.audit_events;
CREATE TRIGGER trg_prevent_audit_mutation
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_mutation();

-- RLS: Select only
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_tenant_select ON public.audit_events;
CREATE POLICY audit_tenant_select ON public.audit_events
  FOR SELECT
  USING (org_id = public.current_org_id());

-- ============================================================================
-- 2. Hardened commit_design_revision RPC (FR-03, FR-04, FR-05, T203-T206)
-- ============================================================================
-- Enforces auth.uid() identity matching, public.authorize project scoping,
-- atomic revision CAS, outbox event, and audit event insertion.

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
  v_caller_uid uuid;
  v_actor_id uuid;
  v_current_rev_id uuid;
  v_new_revision_id uuid;
  v_existing_idemp record;
  v_response jsonb;
  v_authorized boolean;
BEGIN
  -- Step 1: Enforce Verified Caller Identity (FR-03, T203)
  v_caller_uid := auth.uid();

  -- Direct client calls must have an authenticated session
  IF v_caller_uid IS NULL AND current_user != 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'UNAUTHENTICATED',
      'error', 'Database authentication required. No authenticated session found.'
    );
  END IF;

  -- Disallow caller impersonation: caller UID cannot differ from requested actor ID
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND current_user != 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor identity mismatch: caller cannot impersonate another member.'
    );
  END IF;

  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- Step 2: Enforce Organization & Project-Level Authorization (FR-04, T204)
  -- Uses the canonical authorize() function checking active membership and all_projects / assigned_projects scope
  SELECT public.authorize(p_org_id, 'revisions:commit', p_project_id) INTO v_authorized;

  IF NOT v_authorized AND current_user != 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor lacks permission to commit revisions for this project.'
    );
  END IF;

  -- Step 3: Check Idempotency Key (FR-07)
  SELECT * INTO v_existing_idemp
  FROM public.idempotency_records
  WHERE org_id = p_org_id
    AND actor_id = v_actor_id
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

  -- Step 4: Lock Space row for update
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

  -- Step 5: Compare-and-Swap (CAS) Check
  IF (v_current_rev_id IS DISTINCT FROM p_expected_revision_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', true,
      'reason', 'REVISION_CONFLICT',
      'currentRevisionId', v_current_rev_id,
      'error', 'Space current revision has changed since the local draft was created.'
    );
  END IF;

  -- Step 6: Insert immutable revision
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
    v_actor_id,
    now()
  );

  -- Step 7: Advance Space pointer
  UPDATE public.spaces
  SET current_revision_id = v_new_revision_id,
      updated_at = now()
  WHERE id = p_space_id;

  -- Step 8: Atomic Audit Event (FR-05, T205)
  INSERT INTO public.audit_events (
    org_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata_jsonb,
    created_at
  ) VALUES (
    p_org_id,
    v_actor_id,
    'revision.committed',
    'space',
    p_space_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'revision_id', v_new_revision_id,
      'parent_revision_id', v_current_rev_id,
      'canonical_hash', p_canonical_hash
    ),
    now()
  );

  -- Step 9: Enqueue Outbox Event
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
      'committed_by', v_actor_id
    ),
    'pending'
  );

  -- Step 10: Ledger Idempotency Record
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
    v_actor_id,
    'commit_design_revision',
    p_idempotency_key,
    p_canonical_hash,
    200,
    v_response
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_design_revision FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_design_revision TO authenticated, service_role;

-- ============================================================================
-- 3. Single-Transaction Atomic Kitchen Import RPC (FR-06, T401, T402)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.import_kitchen_project(
  p_org_id uuid,
  p_actor_id uuid,
  p_project_name text,
  p_snapshot_jsonb jsonb,
  p_canonical_hash text,
  p_idempotency_key text,
  p_source_file_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid uuid;
  v_actor_id uuid;
  v_project_id uuid;
  v_space_id uuid;
  v_revision_id uuid;
  v_existing_idemp record;
  v_response jsonb;
BEGIN
  -- 1. Identity validation
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor identity mismatch');
  END IF;
  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- 2. Idempotency check
  SELECT * INTO v_existing_idemp FROM public.idempotency_records
  WHERE org_id = p_org_id AND actor_id = v_actor_id AND operation = 'import_kitchen' AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      RETURN v_existing_idemp.response_jsonb;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_KEY_REUSED');
    END IF;
  END IF;

  -- 3. Atomic inserts
  v_project_id := gen_random_uuid();
  INSERT INTO public.projects (id, org_id, name, created_by, status)
  VALUES (v_project_id, p_org_id, p_project_name, v_actor_id, 'active');

  v_space_id := gen_random_uuid();
  INSERT INTO public.spaces (id, org_id, project_id, name, space_type, level)
  VALUES (v_space_id, p_org_id, v_project_id, 'Kitchen', 'kitchen', 0);

  v_revision_id := gen_random_uuid();
  INSERT INTO public.design_revisions (id, org_id, project_id, space_id, schema_version, format, snapshot_jsonb, canonical_hash, created_by)
  VALUES (v_revision_id, p_org_id, v_project_id, v_space_id, 2, 'interior-studio/kitchen', p_snapshot_jsonb, p_canonical_hash, v_actor_id);

  UPDATE public.spaces SET current_revision_id = v_revision_id WHERE id = v_space_id;

  INSERT INTO public.legacy_import_mappings (org_id, source_format, source_entity_type, source_entity_id, target_project_id, target_space_id, first_imported_revision_id, imported_by)
  VALUES (p_org_id, 'interior-studio/kitchen', 'project', p_source_file_id, v_project_id, v_space_id, v_revision_id, v_actor_id);

  INSERT INTO public.audit_events (org_id, actor_id, action, target_type, target_id, metadata_jsonb)
  VALUES (p_org_id, v_actor_id, 'project.imported', 'project', v_project_id, jsonb_build_object('source_format', 'kitchen', 'space_id', v_space_id));

  INSERT INTO public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload_jsonb)
  VALUES (p_org_id, 'project.imported', 'project', v_project_id, jsonb_build_object('project_id', v_project_id, 'space_id', v_space_id));

  v_response := jsonb_build_object(
    'success', true,
    'projectId', v_project_id,
    'spaceId', v_space_id,
    'revisionId', v_revision_id,
    'canonicalHash', p_canonical_hash
  );

  INSERT INTO public.idempotency_records (org_id, actor_id, operation, idempotency_key, request_hash, response_status, response_jsonb)
  VALUES (p_org_id, v_actor_id, 'import_kitchen', p_idempotency_key, p_canonical_hash, 200, v_response);

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.import_kitchen_project FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_kitchen_project TO authenticated, service_role;

-- ============================================================================
-- 4. Single-Transaction Atomic Home Import RPC (FR-06, T401, T402)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.import_home_project(
  p_org_id uuid,
  p_actor_id uuid,
  p_project_name text,
  p_home_id text,
  p_rooms_jsonb jsonb,
  p_canonical_hash text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid uuid;
  v_actor_id uuid;
  v_project_id uuid;
  v_space_id uuid;
  v_revision_id uuid;
  v_existing_idemp record;
  v_room jsonb;
  v_room_name text;
  v_room_type text;
  v_room_level integer;
  v_room_x numeric;
  v_room_z numeric;
  v_snapshot jsonb;
  v_room_hash text;
  v_created_spaces jsonb := '[]'::jsonb;
  v_created_revisions jsonb := '[]'::jsonb;
  v_response jsonb;
BEGIN
  -- 1. Identity validation
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor identity mismatch');
  END IF;
  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- 2. Idempotency check
  SELECT * INTO v_existing_idemp FROM public.idempotency_records
  WHERE org_id = p_org_id AND actor_id = v_actor_id AND operation = 'import_home' AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      RETURN v_existing_idemp.response_jsonb;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_KEY_REUSED');
    END IF;
  END IF;

  -- 3. Atomic inserts
  v_project_id := gen_random_uuid();
  INSERT INTO public.projects (id, org_id, name, created_by, status)
  VALUES (v_project_id, p_org_id, p_project_name, v_actor_id, 'active');

  -- Root mapping
  INSERT INTO public.legacy_import_mappings (org_id, source_format, source_entity_type, source_entity_id, target_project_id, target_space_id, first_imported_revision_id, imported_by)
  VALUES (p_org_id, 'interior-studio/home', 'home', coalesce(p_home_id, v_project_id::text), v_project_id, null, null, v_actor_id);

  -- Rooms iteration
  FOR v_room IN SELECT * FROM jsonb_array_elements(p_rooms_jsonb)
  LOOP
    v_space_id := gen_random_uuid();
    v_revision_id := gen_random_uuid();
    v_room_name := coalesce(v_room->>'name', 'Room');
    v_room_type := coalesce(v_room->>'type', 'other');
    v_room_level := coalesce((v_room->>'level')::integer, 0);
    v_room_x := coalesce((v_room->>'x')::numeric, 0);
    v_room_z := coalesce((v_room->>'z')::numeric, 0);
    v_snapshot := v_room->'snapshot';
    v_room_hash := coalesce(v_room->>'canonical_hash', md5(v_snapshot::text));

    INSERT INTO public.spaces (id, org_id, project_id, name, space_type, level, plan_position_mm, current_revision_id)
    VALUES (v_space_id, p_org_id, v_project_id, v_room_name, v_room_type, v_room_level, jsonb_build_object('x', v_room_x, 'z', v_room_z), v_revision_id);

    INSERT INTO public.design_revisions (id, org_id, project_id, space_id, schema_version, format, snapshot_jsonb, canonical_hash, created_by)
    VALUES (v_revision_id, p_org_id, v_project_id, v_space_id, 2, 'interior-studio/home-room-design', v_snapshot, v_room_hash, v_actor_id);

    INSERT INTO public.legacy_import_mappings (org_id, source_format, source_entity_type, source_entity_id, target_project_id, target_space_id, first_imported_revision_id, imported_by)
    VALUES (p_org_id, 'interior-studio/home', 'room', coalesce(v_room->>'id', v_space_id::text), v_project_id, v_space_id, v_revision_id, v_actor_id);

    v_created_spaces := v_created_spaces || jsonb_build_object('id', v_space_id, 'name', v_room_name);
    v_created_revisions := v_created_revisions || jsonb_build_object('id', v_revision_id, 'space_id', v_space_id);
  END LOOP;

  INSERT INTO public.audit_events (org_id, actor_id, action, target_type, target_id, metadata_jsonb)
  VALUES (p_org_id, v_actor_id, 'project.imported', 'project', v_project_id, jsonb_build_object('source_format', 'home', 'rooms_count', jsonb_array_length(p_rooms_jsonb)));

  INSERT INTO public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload_jsonb)
  VALUES (p_org_id, 'project.imported', 'project', v_project_id, jsonb_build_object('project_id', v_project_id, 'source_format', 'home'));

  v_response := jsonb_build_object(
    'success', true,
    'projectId', v_project_id,
    'spaces', v_created_spaces,
    'revisions', v_created_revisions,
    'canonicalHash', p_canonical_hash
  );

  INSERT INTO public.idempotency_records (org_id, actor_id, operation, idempotency_key, request_hash, response_status, response_jsonb)
  VALUES (p_org_id, v_actor_id, 'import_home', p_idempotency_key, p_canonical_hash, 200, v_response);

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.import_home_project FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_home_project TO authenticated, service_role;
