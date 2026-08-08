import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // modulepreload hints are a network-latency optimization for regular web
    // pages — meaningless for an extension's locally-bundled files, and
    // Chrome's extension module loader logs a "cross-world resource
    // mismatch" warning for them since it doesn't reconcile the preload with
    // the actual load the same way a normal page does.
    modulePreload: false,
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
