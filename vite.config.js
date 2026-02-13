import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy for NEW API (local development only)
      // In production, Vercel serves /api/get-metal-price from api/get-metal-price.js
      '/api/get-metal-price': {
        target: 'https://services.bajracharyajyaasa.com',
        changeOrigin: true,
        rewrite: (path) => {
          // Extract symbol from query params
          const url = new URL(path, 'http://localhost');
          const symbol = url.searchParams.get('symbol') || 'XAU';
          
          // NEW API only needs symbol and api_key
          return `/get-metal-prices.php?symbol=${symbol}&api_key=trust-me-123`;
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('[VITE PROXY] Request:', req.url);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('[VITE PROXY] Response status:', proxyRes.statusCode);
          });
        },
      },
    },
  },
})
