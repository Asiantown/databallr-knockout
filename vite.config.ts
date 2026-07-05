import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5188,
    strictPort: true,
  },
  preview: {
    port: 5188,
    strictPort: true,
  },
});
