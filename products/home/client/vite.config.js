import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  return {
    plugins: [react()],
    envDir: '../',
    server: {
      host: env.HOME_CLIENT_HOST || '127.0.0.1',
      port: Number(env.HOME_CLIENT_PORT) || 5176,
      strictPort: true,
      proxy: {
        '/api/realtime': {
          target: `http://${env.HOME_GATEWAY_HOST || '127.0.0.1'}:${Number(env.HOME_GATEWAY_PORT) || 18891}`,
          ws: true,
        },
        '/api/memory': {
          target: `http://${env.HOME_GATEWAY_HOST || '127.0.0.1'}:${Number(env.HOME_GATEWAY_PORT) || 18891}`,
        },
        '/api': {
          target: env.HOME_SERVICE_ORIGIN || 'http://127.0.0.1:3111',
          ws: true,
        },
      },
    },
  }
})
