/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves `/api/assistant` from the dev server with the same handler as production. Server-only
 * settings (ASSISTANT_* and the provider keys) come from the shell or `.env.local`; they are not
 * VITE_-prefixed, so they never reach the browser bundle.
 */
type NodeHandlerFactory = (env: Record<string, string | undefined>) => (req: unknown, res: unknown) => Promise<void>;

function assistantApi(mode: string): Plugin {
  return {
    name: 'assistant-api',
    configureServer(server) {
      const keys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY'];
      const fileEnv = loadEnv(mode, process.cwd(), ['ASSISTANT_', ...keys]);
      const env = { ...fileEnv, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('ASSISTANT_') || keys.includes(k))) };
      server.middlewares.use('/api/assistant', (req, res, next) => {
        server
          .ssrLoadModule('/src/server/node.ts')
          .then((mod) => (mod as { nodeHandler: NodeHandlerFactory }).nodeHandler(env)(Object.assign(req, { url: '/api/assistant' }), res))
          .catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), assistantApi(mode)],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\\/](three|@react-three)/ }] },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
