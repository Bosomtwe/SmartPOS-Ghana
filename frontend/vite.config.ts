import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'site.webmanifest'
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
            purpose: 'any maskable'
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2}'] // removed svg from glob as well
      }
    })
  ],
  server: {
    host: true,
    allowedHosts: ['localhost', 'desktop-l5blt2r.tail740aa4.ts.net'],
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true }
    }
  }
})