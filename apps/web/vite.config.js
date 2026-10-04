import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  server: {
    // `npm run dev:web` serves the shell on Vite; the API comes from `wrangler dev` on 8787
    proxy: { '/api': 'http://localhost:8787' },
  },
});
