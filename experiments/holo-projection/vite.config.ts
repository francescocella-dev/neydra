import { defineConfig } from 'vite';
export default defineConfig({ publicDir: 'local/public', server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }, build: { chunkSizeWarningLimit: 650 } });
