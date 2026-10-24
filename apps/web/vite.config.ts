import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) takes a function here.
        manualChunks(id: string) {
          if (/node_modules\/(three|@react-three)\//.test(id)) return 'three';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          return undefined;
        },
      },
    },
  },
});
