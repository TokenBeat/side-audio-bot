import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  return {
    plugins: [react()],
    envDir: '../',
    server: {
      host: env.CARE_CLIENT_HOST || '127.0.0.1',
      port: Number(env.CARE_CLIENT_PORT) || 5175,
      strictPort: true,
      proxy: {
        '/api/realtime': {
          target: `http://${env.CARE_GATEWAY_HOST || '127.0.0.1'}:${Number(env.CARE_GATEWAY_PORT) || 18890}`,
          ws: true,
        },
        '/api/memory': {
          target: `http://${env.CARE_GATEWAY_HOST || '127.0.0.1'}:${Number(env.CARE_GATEWAY_PORT) || 18890}`,
        },
        '/api': {
          target: env.CARE_SERVICE_ORIGIN || 'http://127.0.0.1:3110',
          ws: true,
        },
      },
    },
  }
})
