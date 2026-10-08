import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    vue(),
    ui({
      colorMode: false,
      ui: {
        colors: { primary: 'sky', neutral: 'slate' },
        input: { slots: { base: 'rounded px-4 py-3 text-base md:text-sm' } },
        inputMenu: {
          slots: { base: 'rounded px-2 py-2 text-base md:text-sm' },
        },
        select: { slots: { base: 'rounded px-4 py-3 text-base md:text-sm' } },
      },
      autoImport: false,
      components: { dts: 'src/components.d.ts' },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: { outDir: 'dist/client', emptyOutDir: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
  },
});
