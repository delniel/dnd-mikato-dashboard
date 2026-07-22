import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    base: env.GITHUB_ACTIONS ? '/dnd-mikato-dashboard/' : '/',
    plugins: [react(), tailwindcss()],
    test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' },
  }
})
