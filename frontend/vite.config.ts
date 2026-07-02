import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // ✅ Switch to injectManifest strategy
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js', // your custom SW
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'site.webmanifest',
        'browserconfig.xml',
      ],
      manifest: {
        name: 'SmartPOS Ghana',
        short_name: 'SmartPOS',
        description: 'Point of Sale system for Ghanaian businesses',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0F6B3E',
        background_color: '#0F6B3E',
        icons: [
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        // This injects the precache manifest into your sw.js
        globPatterns: ['**/*.{js,css,html,ico,png,woff2,svg,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
      },
    }),
  ],
  server: {
    host: true,
    allowedHosts: ['localhost', 'desktop-l5blt2r.tail740aa4.ts.net'],
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});