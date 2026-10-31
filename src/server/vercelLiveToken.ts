/** Entry point of the `/api/live-token` Vercel function bundled by scripts/build-vercel-output.mjs. */
import type { ServerEnv } from './assistantHandler';
import { liveTokenNodeHandler } from './node';

const env = (globalThis as { process?: { env: ServerEnv } }).process?.env ?? {};

export default liveTokenNodeHandler(env);
