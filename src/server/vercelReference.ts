/** Entry point of the `/api/reference` Vercel function bundled by scripts/build-vercel-output.mjs. */
import type { ServerEnv } from './assistantHandler';
import { referenceNodeHandler } from './node';

const env = (globalThis as { process?: { env: ServerEnv } }).process?.env ?? {};

export default referenceNodeHandler(env);
