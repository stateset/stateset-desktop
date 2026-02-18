/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import crypto from 'node:crypto';

// Ensure Vite can access crypto.getRandomValues on older Node runtimes.
const nodeCrypto = crypto as typeof crypto & {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
  webcrypto?: { getRandomValues: (array: Uint8Array) => Uint8Array };
};
if (typeof nodeCrypto.getRandomValues !== 'function' && nodeCrypto.webcrypto?.getRandomValues) {
  nodeCrypto.getRandomValues = nodeCrypto.webcrypto.getRandomValues.bind(nodeCrypto.webcrypto);
}
if (typeof globalThis.crypto === 'undefined' && nodeCrypto.webcrypto) {
  (globalThis as typeof globalThis & { crypto?: unknown }).crypto = nodeCrypto.webcrypto;
}

// Provide defaults so `index.html` `%VITE_*%` placeholders always resolve and the build stays warning-free.
// These can still be overridden via `.env` or the environment.
process.env.VITE_API_URL ??= 'https://engine.stateset.cloud.stateset.app';
process.env.VITE_SANDBOX_API_URL ??= 'https://api.sandbox.stateset.app';
process.env.VITE_CSP_CONNECT_SRC ??= '';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'data-vendor': ['@tanstack/react-query', 'zustand', 'date-fns'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/vitest-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/**/*.ts',
        'src/stores/**/*.ts',
        'src/hooks/**/*.ts',
        'src/components/**/*.tsx',
        'src/pages/**/*.tsx',
        'src/features/**/*.{ts,tsx}',
        'electron/**/*.ts',
      ],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*'],
    },
  },
});
