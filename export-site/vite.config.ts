import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Builds the fully static, server-free gift site (Milestone 5 Part C). Deliberately separate
// from the main Next.js app's build — this bundle ships with zero API routes and zero server
// dependency, so it can be dropped on any static host (Cloudflare Pages, S3, `python -m http.server`, ...).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
