import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.API_KEY || env.VITE_API_KEY || 'dev_key_123';
  const targetHost = env.BACKEND_URL || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: targetHost,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              // Securely attach secret API Key on dev server proxy side.
              // API_KEY is NEVER exposed to browser bundle or network tab in client requests.
              proxyReq.setHeader('X-API-Key', apiKey);
            });
          },
        },
      },
    },
  };
});
