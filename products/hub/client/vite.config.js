import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  return {
    plugins: [react()],
    envDir: '../',
    server: {
      host: env.HUB_CLIENT_HOST || '127.0.0.1',
      port: Number(env.HUB_CLIENT_PORT) || 5177,
      strictPort: true,
      proxy: {
        '/api/realtime': {
          target: `http://${env.HUB_GATEWAY_HOST || '127.0.0.1'}:${Number(env.HUB_GATEWAY_PORT) || 18892}`,
          ws: true,
        },
        '/api/memory': {
          target: `http://${env.HUB_GATEWAY_HOST || '127.0.0.1'}:${Number(env.HUB_GATEWAY_PORT) || 18892}`,
        },
        '/api': {
          target: env.HUB_SERVICE_ORIGIN || 'http://127.0.0.1:3112',
          ws: true,
        },
      },
    },
  }
})
