# Blender worker

Blender 4.5 LTS (as the `bpy` Python module) behind a small HTTP server, deployed to Cloud Run
in Mumbai (`asia-south1`) by `.github/workflows/blender-worker.yml`.

- `POST /render` — Cycles render of a scene the browser exported (glTF in the private
  `render-jobs` bucket). Streams NDJSON progress; the last line carries the image (base64).
- `POST /recipe` — builds an AI furniture recipe with Blender geometry (bevels, smooth shading)
  and returns GLB. Not wired into the app yet; the browser builder is used for now.
- `GET /health`

**No secrets.** Callers send their Supabase access token; the worker validates it with Supabase
Auth, requires designer/admin/owner in the studio, and reads the scene with the caller's own
permissions (RLS). Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `ALLOWED_ORIGINS`.

Sizing: 8 vCPU / 16 GiB, concurrency 1, timeout 60 min, 0–3 instances (billed only while
rendering). An HD still takes about 1–3 minutes on CPU.

## Setup (once)

1. Billing enabled on `interior-studio-512608`.
2. In Cloud Shell: `bash setup-gcp.sh` → prints `PROJECT_NUMBER=…`.
3. Put that number in `PROJECT_NUMBER` in the workflow and push; Actions builds and deploys.
4. Set `VITE_BLENDER_WORKER_URL=https://blender-worker-<PROJECT_NUMBER>.asia-south1.run.app` in
   Vercel and redeploy the app. The Renders panel then offers "Cloud · Blender Cycles".

## Local test

```sh
uv venv -p 3.11 .venv && uv pip install -p .venv/bin/python bpy==4.5.3
SUPABASE_URL=… SUPABASE_ANON_KEY=… .venv/bin/python server.py
```
