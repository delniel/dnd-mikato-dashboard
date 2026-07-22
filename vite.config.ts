import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/dnd-mikato-dashboard/' : '/',
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' },
}))
