import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the public Tailscale domain so Vite doesn't block it
    allowedHosts: [
      'localhost',
      'desktop-l5blt2r.tail740aa4.ts.net',
    ],
   // proxy: {
   //   '/api': {
   //     target: 'http://localhost:8000', 
    //    changeOrigin: true,
    //  }
    //}
  }
})
