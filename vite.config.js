import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],
    preview: {
      host: '0.0.0.0',
      port: Number.parseInt(env.PORT, 10) || 8080,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '.up.railway.app',
        'front-end-production-335b.up.railway.app',
      ],
    },
  }
})