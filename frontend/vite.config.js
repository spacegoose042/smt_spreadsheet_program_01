import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  preview: {
    port: parseInt(process.env.PORT || '5173'),
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: [
      '.railway.app',
      '.up.railway.app',
      'localhost',
      '127.0.0.1'
    ]
  }
})

