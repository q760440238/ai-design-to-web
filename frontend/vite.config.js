import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const workspaceEnvDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceEnvDir, '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [vue()],
    envDir: workspaceEnvDir,
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
