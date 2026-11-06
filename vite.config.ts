/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves the `/api/*` endpoints (assistant, speech, live-token, render, reference) from the dev server with the same handler as production. Server-only
 * settings (ASSISTANT_* and the provider keys) come from the shell or `.env.local`; they are not
 * VITE_-prefixed, so they never reach the browser bundle. The Supabase URL and publishable key are
 * passed too, so local AI calls are verified and charged like production (spec 045).
 */
type NodeHandlerFactory = (env: Record<string, string | undefined>) => (req: unknown, res: unknown) => Promise<void>;

function assistantApi(mode: string): Plugin {
  return {
    name: 'assistant-api',
    configureServer(server) {
      // Supabase URL and publishable key: the AI endpoints verify the caller and charge credits (spec 045).
      const keys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
      const fileEnv = loadEnv(mode, process.cwd(), ['ASSISTANT_', ...keys]);
      const env = { ...fileEnv, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('ASSISTANT_') || keys.includes(k))) };
      for (const [path, factory] of [['/api/assistant', 'nodeHandler'], ['/api/speech', 'speechNodeHandler'], ['/api/live-token', 'liveTokenNodeHandler'], ['/api/render', 'renderNodeHandler'], ['/api/reference', 'referenceNodeHandler']] as const) {
        server.middlewares.use(path, (req, res, next) => {
          server
            .ssrLoadModule('/src/server/node.ts')
            .then((mod) => (mod as Record<typeof factory, NodeHandlerFactory>)[factory](env)(Object.assign(req, { url: path }), res))
            .catch(next);
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), assistantApi(mode)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@studio/core': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
      '@studio/platform': fileURLToPath(new URL('./packages/platform/src', import.meta.url)),
      '@studio/catalog': fileURLToPath(new URL('./packages/catalog/src', import.meta.url)),
      '@studio/engine': fileURLToPath(new URL('./packages/engine/src', import.meta.url)),
      '@studio/measure': fileURLToPath(new URL('./packages/measure/src', import.meta.url)),
      '@studio/commercial': fileURLToPath(new URL('./packages/commercial/src', import.meta.url)),
      '@studio/deliverables': fileURLToPath(new URL('./packages/deliverables/src', import.meta.url)),
      '@studio/ai': fileURLToPath(new URL('./packages/ai/src', import.meta.url)),
    },
  },
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
