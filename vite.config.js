import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/gold': {
          target: 'https://api.gold-api.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gold/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Add the required headers
              proxyReq.setHeader('x-api-key', env.VITE_GOLD_API_KEY || '');
              proxyReq.setHeader('Content-Type', 'application/json');
            });
          },
        },
      },
    },
  }
})
