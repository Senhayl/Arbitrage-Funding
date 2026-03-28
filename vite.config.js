import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 8080,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.up.railway.app',
      'front-end-production-335b.up.railway.app',
    ],
  },
})