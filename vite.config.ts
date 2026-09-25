import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from the GitHub Pages sub-path
  // (https://<owner>.github.io/inkforge/) as well as from the dev server.
  base: './',
  build: {
    target: 'es2022',
    // Phaser alone is well over Vite's default 500 kB warning limit.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
