-- Migration: 00011_final_security_and_persistence_closure.sql
-- Description: Feature 034.2.1 — Harden SECURITY DEFINER role checks (auth.role() vs current_user),
--              enforce project:create RBAC in import RPCs, and add concurrency-safe idempotency serialization.

-- ============================================================================
-- 1. Hardened commit_design_revision with auth.role() and Advisory Locking
-- ============================================================================

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
  v_caller_role text;
  v_is_service boolean;
  v_actor_id uuid;
  v_current_rev_id uuid;
  v_new_revision_id uuid;
  v_existing_idemp record;
  v_response jsonb;
  v_authorized boolean;
BEGIN
  -- Step 1: Derive verified caller role and UID (FR-07)
  -- Use auth.role() / claim role rather than current_user which resolves to function owner
  v_caller_role := coalesce(auth.role(), current_setting('request.jwt.claim.role', true));
  v_is_service := (v_caller_role = 'service_role');
  v_caller_uid := auth.uid();

  -- Direct client calls must have an authenticated session
  IF v_caller_uid IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'UNAUTHENTICATED',
      'error', 'Database authentication required. No authenticated session found.'
    );
  END IF;

  -- Disallow caller impersonation: caller UID cannot differ from requested actor ID
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND NOT v_is_service THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor identity mismatch: caller cannot impersonate another member.'
    );
  END IF;

  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- Step 2: Enforce Organization & Project-Level Authorization
  SELECT public.authorize(p_org_id, 'revisions:commit', p_project_id) INTO v_authorized;
  IF NOT v_authorized AND NOT v_is_service THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor lacks permission to commit revisions for this project.'
    );
  END IF;

  -- Step 3: Concurrency serialization on Idempotency Key (FR-07)
  -- Acquire transaction-scoped advisory lock to serialize concurrent identical requests
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || v_actor_id::text),
    hashtext('commit_design_revision:' || p_idempotency_key)
  );

  SELECT * INTO v_existing_idemp
  FROM public.idempotency_records
  WHERE org_id = p_org_id
    AND actor_id = v_actor_id
    AND operation = 'commit_design_revision'
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      RETURN v_existing_idemp.response_jsonb;
    ELSE
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

  -- Step 8: Atomic Audit Event
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

-- ============================================================================
-- 2. Hardened import_kitchen_project with projects:create RBAC and Concurrency
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
  v_caller_role text;
  v_is_service boolean;
  v_actor_id uuid;
  v_authorized boolean;
  v_project_id uuid;
  v_space_id uuid;
  v_revision_id uuid;
  v_existing_idemp record;
  v_response jsonb;
BEGIN
  -- 1. Identity validation (FR-07)
  v_caller_role := coalesce(auth.role(), current_setting('request.jwt.claim.role', true));
  v_is_service := (v_caller_role = 'service_role');
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;

  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor identity mismatch: caller cannot impersonate another member');
  END IF;

  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- 2. Authorization check: projects:create in p_org_id (FR-07)
  SELECT public.authorize(p_org_id, 'projects:create') INTO v_authorized;
  IF NOT v_authorized AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor lacks permission to create projects in this organization');
  END IF;

  -- 3. Concurrency serialization on Idempotency Key
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || v_actor_id::text),
    hashtext('import_kitchen:' || p_idempotency_key)
  );

  SELECT * INTO v_existing_idemp FROM public.idempotency_records
  WHERE org_id = p_org_id AND actor_id = v_actor_id AND operation = 'import_kitchen' AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      RETURN v_existing_idemp.response_jsonb;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_KEY_REUSED');
    END IF;
  END IF;

  -- 4. Atomic inserts
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
  VALUES (p_org_id, 'interior-studio/kitchen', 'project', coalesce(p_source_file_id, v_project_id::text), v_project_id, v_space_id, v_revision_id, v_actor_id);

  INSERT INTO public.audit_events (org_id, actor_id, action, target_type, target_id, metadata_jsonb)
  VALUES (p_org_id, v_actor_id, 'project.imported', 'project', v_project_id, jsonb_build_object('source_format', 'kitchen', 'space_id', v_space_id));

  INSERT INTO public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload_jsonb)
  VALUES (p_org_id, 'project.imported', 'project', v_project_id, jsonb_build_object('project_id', v_project_id, 'space_id', v_space_id));

  v_response := jsonb_build_object(
    'success', true,
    'projectId', v_project_id,
    'spaceId', v_space_id,
    'revisionId', v_revision_id,
    'canonicalHash', p_canonical_hash,
    'project', jsonb_build_object(
      'id', v_project_id,
      'org_id', p_org_id,
      'name', p_project_name,
      'status', 'active',
      'created_by', v_actor_id,
      'created_at', now(),
      'updated_at', now()
    ),
    'space', jsonb_build_object(
      'id', v_space_id,
      'org_id', p_org_id,
      'project_id', v_project_id,
      'name', 'Kitchen',
      'space_type', 'kitchen',
      'level', 0,
      'current_revision_id', v_revision_id,
      'created_at', now(),
      'updated_at', now()
    ),
    'revision', jsonb_build_object(
      'id', v_revision_id,
      'org_id', p_org_id,
      'project_id', v_project_id,
      'space_id', v_space_id,
      'schema_version', 2,
      'format', 'interior-studio/kitchen',
      'snapshot_jsonb', p_snapshot_jsonb,
      'canonical_hash', p_canonical_hash,
      'created_by', v_actor_id,
      'created_at', now()
    )
  );

  INSERT INTO public.idempotency_records (org_id, actor_id, operation, idempotency_key, request_hash, response_status, response_jsonb)
  VALUES (p_org_id, v_actor_id, 'import_kitchen', p_idempotency_key, p_canonical_hash, 200, v_response);

  RETURN v_response;
END;
$$;

-- ============================================================================
-- 3. Hardened import_home_project with projects:create RBAC and Concurrency
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
  v_caller_role text;
  v_is_service boolean;
  v_actor_id uuid;
  v_authorized boolean;
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
  -- 1. Identity validation (FR-07)
  v_caller_role := coalesce(auth.role(), current_setting('request.jwt.claim.role', true));
  v_is_service := (v_caller_role = 'service_role');
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;

  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor identity mismatch: caller cannot impersonate another member');
  END IF;

  v_actor_id := coalesce(v_caller_uid, p_actor_id);

  -- 2. Authorization check: projects:create in p_org_id (FR-07)
  SELECT public.authorize(p_org_id, 'projects:create') INTO v_authorized;
  IF NOT v_authorized AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor lacks permission to create projects in this organization');
  END IF;

  -- 3. Concurrency serialization on Idempotency Key
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text || ':' || v_actor_id::text),
    hashtext('import_home:' || p_idempotency_key)
  );

  SELECT * INTO v_existing_idemp FROM public.idempotency_records
  WHERE org_id = p_org_id AND actor_id = v_actor_id AND operation = 'import_home' AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idemp.request_hash = p_canonical_hash THEN
      RETURN v_existing_idemp.response_jsonb;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_KEY_REUSED');
    END IF;
  END IF;

  -- 4. Atomic inserts
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

    v_created_spaces := v_created_spaces || jsonb_build_object(
      'id', v_space_id,
      'org_id', p_org_id,
      'project_id', v_project_id,
      'name', v_room_name,
      'space_type', v_room_type,
      'level', v_room_level,
      'plan_position_mm', jsonb_build_object('x', v_room_x, 'z', v_room_z),
      'current_revision_id', v_revision_id,
      'created_at', now(),
      'updated_at', now()
    );

    v_created_revisions := v_created_revisions || jsonb_build_object(
      'id', v_revision_id,
      'org_id', p_org_id,
      'project_id', v_project_id,
      'space_id', v_space_id,
      'schema_version', 2,
      'format', 'interior-studio/home-room-design',
      'snapshot_jsonb', v_snapshot,
      'canonical_hash', v_room_hash,
      'created_by', v_actor_id,
      'created_at', now()
    );
  END LOOP;

  INSERT INTO public.audit_events (org_id, actor_id, action, target_type, target_id, metadata_jsonb)
  VALUES (p_org_id, v_actor_id, 'project.imported', 'project', v_project_id, jsonb_build_object('source_format', 'home', 'rooms_count', jsonb_array_length(p_rooms_jsonb)));

  INSERT INTO public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload_jsonb)
  VALUES (p_org_id, 'project.imported', 'project', v_project_id, jsonb_build_object('project_id', v_project_id, 'source_format', 'home'));

  v_response := jsonb_build_object(
    'success', true,
    'projectId', v_project_id,
    'canonicalHash', p_canonical_hash,
    'project', jsonb_build_object(
      'id', v_project_id,
      'org_id', p_org_id,
      'name', p_project_name,
      'status', 'active',
      'created_by', v_actor_id,
      'created_at', now(),
      'updated_at', now()
    ),
    'spaces', v_created_spaces,
    'revisions', v_created_revisions
  );

  INSERT INTO public.idempotency_records (org_id, actor_id, operation, idempotency_key, request_hash, response_status, response_jsonb)
  VALUES (p_org_id, v_actor_id, 'import_home', p_idempotency_key, p_canonical_hash, 200, v_response);

  RETURN v_response;
END;
$$;

-- Privileges: execute granted exclusively to authenticated and service_role
REVOKE ALL ON FUNCTION public.commit_design_revision FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_design_revision TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.import_kitchen_project FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_kitchen_project TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.import_home_project FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_home_project TO authenticated, service_role;
