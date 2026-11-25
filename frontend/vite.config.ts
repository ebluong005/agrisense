import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Override for parallel test servers, e.g. AGRISENSE_API_TARGET=http://127.0.0.1:8100
const API_TARGET = process.env.AGRISENSE_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local development: the browser calls /api on the Vite origin, Vite forwards to FastAPI.
    proxy: { '/api': API_TARGET, '/health': API_TARGET },
  },
  preview: {
    proxy: { '/api': API_TARGET, '/health': API_TARGET },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'], // e2e/ is Playwright's
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
})
