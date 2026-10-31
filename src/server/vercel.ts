/** Entry point of the Vercel function bundled by scripts/build-vercel-output.mjs. */
import type { ServerEnv } from './assistantHandler';
import { nodeHandler } from './node';

const env = (globalThis as { process?: { env: ServerEnv } }).process?.env ?? {};

export default nodeHandler(env);
