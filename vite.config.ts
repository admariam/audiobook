import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Base do Vite para GitHub Pages.
 * - Em GitHub Actions, GITHUB_REPOSITORY ("usuario/repo") define o subdiretório.
 * - Repositórios "usuario.github.io" são publicados na raiz.
 * - VITE_BASE permite sobrescrever manualmente.
 */
function resolveBase(): string {
  const override = process.env.VITE_BASE;
  if (override) {
    return override.endsWith('/') ? override : `${override}/`;
  }
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) return '/';
  if (repo.toLowerCase().endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
});
