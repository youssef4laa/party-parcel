import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Builds the fully static, server-free gift site (Milestone 5 Part C). Deliberately separate
// from the main Next.js app's build — this bundle ships with zero API routes and zero server
// dependency, so it can be dropped on any static host (Cloudflare Pages, S3, `python -m http.server`, ...).
export default defineConfig({
  // Relative asset/script paths, not root-absolute ones — an exported folder isn't guaranteed to
  // be served from a domain's root (e.g. Cloudflare Pages *can* put it at the root, but a host
  // also might not, and testing it via "serve the parent, open /<folder>/" needs this too).
  // Without this, Vite's default `base: '/'` bakes in absolute `/assets/...` references that
  // 404 from any subpath.
  base: './',
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
