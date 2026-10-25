import fs from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

try {
  const realCwd = fs.realpathSync(process.cwd());
  if (realCwd !== process.cwd()) {
    process.chdir(realCwd);
  }
} catch {}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.API_KEY || env.VITE_API_KEY || 'dev_key_123';
  const targetHost = env.BACKEND_URL || 'http://127.0.0.1:8000';
  const isHostFlagPassed = process.argv.some(
    (arg) => arg === '--host' || arg.startsWith('--host=')
  );

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      fs: {
        strict: true,
      },
      proxy: {
        '/api': {
          target: targetHost,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              const clientIp = req.socket?.remoteAddress || '';
              const isLocalClient =
                clientIp === '127.0.0.1' ||
                clientIp === '::1' ||
                clientIp === '::ffff:127.0.0.1';

              if (isHostFlagPassed || !isLocalClient) {
                console.warn(
                  `\x1b[33m[SECURITY WARNING] Non-local/LAN request detected (${clientIp}). ` +
                  `API_KEY injection disabled for security. Request will receive 401 Unauthorized.\x1b[0m`
                );
                return;
              }

              // Securely attach secret API Key only for local dev requests
              proxyReq.setHeader('X-API-Key', apiKey);
            });
          },
        },
      },
    },
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
