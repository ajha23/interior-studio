/**
 * Writes `.vercel/output` (Vercel Build Output API v3) after `npm run build`:
 *   static/                         the built app (dist/)
 *   functions/api/assistant.func/   /api/assistant as one self-contained Node bundle
 *   config.json                     security headers, filesystem, SPA fallback
 * The function is bundled with Vite (Rolldown), so path aliases and extensionless imports work and
 * no node_modules are needed at runtime. Server-only settings are read from the environment there.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}.vercel/output`;
if (!existsSync(`${root}dist/index.html`)) throw new Error('Run `npm run build` first: dist/ is missing.');

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/static`, { recursive: true });
cpSync(`${root}dist`, `${out}/static`, { recursive: true });

const func = `${out}/functions/api/assistant.func`;
await build({
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': `${root}src` } },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: `${root}src/server/vercel.ts`,
    outDir: func,
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    rolldownOptions: { output: { format: 'es', entryFileNames: 'index.mjs', codeSplitting: false } },
  },
});
writeFileSync(`${func}/package.json`, JSON.stringify({ type: 'module' }));
writeFileSync(`${func}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2));

const headers = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/(.*)', headers, continue: true },
        { handle: 'filesystem' },
        { src: '/api/(.*)', status: 404, dest: '/404' },
        { src: '/((?!assets/).*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Wrote ${out} (static app + /api/assistant function)`);
