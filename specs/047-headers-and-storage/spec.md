# Feature Specification: 047 — Security Headers and Storage Policies

**Feature Branch**: `047-headers-and-storage`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 2 — Lock down (estimate 2 days)
**Depends on**: 043
**Blocks**: 051 (render files), Phase 2 completion
**Source**: Architecture Review (Security: no CSP; Phase 2: storage buckets scoped to `org_id/`) and Playbook (047)

## Context

`vercel.json` sets only frame, content-type-sniffing and referrer headers; there is no Content-Security-Policy, HSTS or Permissions-Policy. The editor uses the camera and microphone (voice, site capture), WebGL workers, `blob:` URLs, and talks to Supabase over HTTPS and WebSocket.

The live project has five private storage buckets — `models`, `renders`, `ai`, `plans`, `render-jobs` — whose policies must scope access to the owning studio. Client sharing must use expiring signed URLs, never public buckets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browser-enforced protections (Priority: P1)

As the founder, I want strict security headers on every response, so that injected scripts, framing and unwanted device access are blocked by the browser.

**Why this priority**: Cheap, broad protection against XSS and clickjacking for a product that handles client data.

**Independent Test**: securityheaders.com grades production A; a full session shows no CSP violations in the console.

**Acceptance Scenarios**:

1. **Given** any response from production (page, asset or `/api/*`), **When** I inspect headers, **Then** it carries `Content-Security-Policy`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and `Permissions-Policy` with `camera=(self), microphone=(self), geolocation=()`.
2. **Given** the CSP, **When** I read it, **Then** it contains: `default-src 'self'`; `connect-src 'self'` plus the Supabase URL and its `wss:` realtime endpoint; `img-src 'self' data: blob:` plus Supabase storage; `worker-src 'self' blob:`; `style-src 'self' 'unsafe-inline'`; `frame-ancestors 'none'`.
3. **Given** the first week after release, **When** the header ships, **Then** it is `Content-Security-Policy-Report-Only` with a report endpoint; after a week without unexplained violations it switches to enforcing.
4. **Given** CSP is enforced, **When** I sign in, open a project, render, upload a photo and use voice, **Then** the console shows no CSP violations and every feature works.

---

### User Story 2 — Studio files stay in the studio (Priority: P1)

As a studio owner, I want our renders, plans, models and photos readable only by our members, so that client work never leaks to another studio.

**Independent Test**: pgTAP storage tests — own studio allowed, other studio denied, anon denied — pass for every bucket.

**Acceptance Scenarios**:

1. **Given** a file at `<org_id>/<…>` in any of the five buckets, **When** a member of that studio reads it, **Then** it succeeds.
2. **Given** the same file, **When** a member of another studio or `anon` reads it, **Then** it is denied.
3. **Given** a viewer, **When** they upload or delete in their own studio's path, **Then** it is denied; owner, admin and designer may write.
4. **Given** an upload whose first path segment is not a studio the user belongs to, **When** it is attempted, **Then** it is denied.
5. **Given** a file over the bucket's size limit or of a disallowed MIME type, **When** uploaded, **Then** it is rejected.

---

### User Story 3 — Share with clients by expiring link (Priority: P2)

As a designer, I want to share a render or plan with a client by a link that expires, so that clients can view without accounts and links do not live forever.

**Acceptance Scenarios**:

1. **Given** a render in my studio, **When** I create a share link, **Then** it is a signed URL with a stated expiry (default 7 days).
2. **Given** an expired link, **When** a client opens it, **Then** access is denied.
3. **Given** the bucket list, **When** I check configuration, **Then** no bucket is public.

### Edge Cases

- Third-party scripts or fonts (analytics, Google Fonts) currently loaded: inventoried during Report-Only and either allowlisted explicitly or removed.
- three.js or a library uses `eval`/`new Function`: Report-Only surfaces it; fix or document; never add `'unsafe-eval'` without a written exception.
- Existing files stored without an `org_id` prefix: a one-time inventory; files are moved under the right prefix or listed for manual decision; policy tests run on the new layout.
- Site-capture route on mobile needs the camera: covered by `camera=(self)`.
- Vercel preview domains: `connect-src` uses the staging Supabase URL for previews (build-time env).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Headers MUST be set in both `vercel.json` and `scripts/build-vercel-output.mjs` so every response (static and function) carries them.
- **FR-002**: CSP MUST match User Story 1 scenario 2, with Supabase origins injected from build-time environment.
- **FR-003**: CSP MUST ship Report-Only with a report endpoint for one week, then enforce; the switch date is recorded.
- **FR-004**: HSTS MUST be 2 years with `includeSubDomains`.
- **FR-005**: Permissions-Policy MUST allow camera and microphone for self only and disable geolocation.
- **FR-006**: Storage policies on `models`, `renders`, `ai`, `plans`, `render-jobs` MUST require the first path segment to be an `org_id` the user is a member of for read; write and delete additionally require owner, admin or designer.
- **FR-007**: Each bucket MUST have a file-size limit and an allowed-MIME list (recorded per bucket in `docs/`).
- **FR-008**: No bucket MAY be public; client shares MUST use signed URLs with expiry.
- **FR-009**: Policy changes MUST arrive as migrations with pgTAP tests on `storage.objects`.

### Key Entities

- **Storage object path**: `<org_id>/<project_id>/<file>`.
- **Bucket configuration**: name, public=false, size limit, allowed MIME types.
- **Signed share link**: object path, expiry.

## Success Criteria *(mandatory)*

- **SC-001**: securityheaders.com grade A on production.
- **SC-002**: Zero CSP violations in a full recorded session after enforcement.
- **SC-003**: Storage pgTAP suite passes for all five buckets × (own, other, anon) × (read, write).

## Assumptions

- Voice and site capture are the only features needing device permissions.
- Default share expiry 7 days; can be changed later per studio.

## Out of Scope

Client portal (Phase 6); WAF rules (045); image transformation services.

## Gate

The browser console shows no CSP violations during a full session: sign in, open a project, render, upload a photo, use voice.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — platform headers and storage policies.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec.

### 3. Usage and Commercial Limits
- **Applicable Quotas**: per-bucket file-size limits (safety, not commercial).

### 4. RBAC Requirements
- **Required Permissions**: read — any member; write/delete — owner, admin, designer.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: every object in the five buckets.
- **Tenant Isolation Requirements**: first path segment is `org_id`, checked via `private.is_org_member` in storage policies.
- **Storage and Cache Isolation**: no public buckets; signed URLs expire.
- **Background Worker Tenant Context**: render worker (051) writes under `<org_id>/<project_id>/` only.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: share UI creates signed URLs only.
- **Backend**: storage RLS policies; browser CSP/HSTS/Permissions-Policy.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: other-studio read/write denied on each bucket (pgTAP).
- **RBAC Permission Tests**: viewer write denied; designer write allowed.
- **Anonymous Tests**: anon denied on each bucket.
- **Header Tests**: automated check (Playwright or curl in CI) that each header is present with the expected value.
