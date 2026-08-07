import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        options: resolve(import.meta.dirname, 'options.html'),
        content: resolve(import.meta.dirname, 'src/content.js'),
        background: resolve(import.meta.dirname, 'src/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
