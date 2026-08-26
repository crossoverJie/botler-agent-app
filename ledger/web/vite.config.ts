import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      '@data': resolve(root, '..', 'data'),
    },
  },
  server: {
    fs: {
      // allow reading the project data/ dir (parent of web/)
      allow: [resolve(root, '..')],
    },
  },
  build: {
    outDir: 'dist',
    // keep everything inlined so the output is a single double-clickable file
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
