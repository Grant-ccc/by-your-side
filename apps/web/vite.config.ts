import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const envRoot = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  // Only the API port is used for the proxy; no DB credentials are exposed through VITE_ variables.
  const env = loadEnv(mode, envRoot, '');
  const apiPort = process.env.API_PORT || env.API_PORT || '17401';
  return {
    root,
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 17400,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}`, '/health': `http://127.0.0.1:${apiPort}` },
    },
    preview: { host: '127.0.0.1' },
    build: { outDir: 'dist' },
  };
});
