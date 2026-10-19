/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The documented browser floor (README "Browser support"). oklch() colors and
    // crypto.randomUUID() set it; Vite 8's default target would drop Safari < 16.4.
    target: ['chrome111', 'edge111', 'firefox113', 'safari15.4'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
  },
});
