/** Entry point of the `/api/speech` Vercel function bundled by scripts/build-vercel-output.mjs. */
import type { ServerEnv } from './assistantHandler';
import { speechNodeHandler } from './node';

const env = (globalThis as { process?: { env: ServerEnv } }).process?.env ?? {};

export default speechNodeHandler(env);
