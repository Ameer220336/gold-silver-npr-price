import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  // Get API keys from comma-separated list
  const apiKeysString = env.VITE_GOLD_API_SECRET || env.VITE_GOLD_API_KEY || '';
  const apiKeys = apiKeysString.split(',').map(k => k.trim()).filter(k => k);
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/gold': {
          target: 'https://api.gold-api.com',
          changeOrigin: true,
          rewrite: (path) => {
            // Rewrite /api/gold/* to /* 
            return path.replace(/^\/api\/gold/, '');
          },
          configure: (proxy, options) => {
            let currentKeyIndex = 0;
            
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Rotate through keys on each request
              if (apiKeys.length > 0) {
                const key = apiKeys[currentKeyIndex % apiKeys.length];
                currentKeyIndex++;
                proxyReq.setHeader('x-api-key', key);
              }
              proxyReq.setHeader('Content-Type', 'application/json');
            });
            
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // Log if rate limited
              if (proxyRes.statusCode === 429) {
                console.log('Rate limit hit, will use next key on next request');
              }
            });
          },
        },
      },
    },
  }
})
