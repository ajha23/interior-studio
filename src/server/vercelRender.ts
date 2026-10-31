/** Entry point of the `/api/render` Vercel function bundled by scripts/build-vercel-output.mjs. */
import type { ServerEnv } from './assistantHandler';
import { renderNodeHandler } from './node';

const env = (globalThis as { process?: { env: ServerEnv } }).process?.env ?? {};

export default renderNodeHandler(env);
