import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // tsconfig keeps JSX as-is for Next; tests need it compiled.
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
