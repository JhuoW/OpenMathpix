import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['node_modules/**', 'out/**', 'dist/**', '.test-dist/**', '.tmp-*/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'electron.vite.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
]);
