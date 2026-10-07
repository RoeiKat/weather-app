import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.WEATHER_API_PROXY
if (apiTarget && !['http:', 'https:'].includes(new URL(apiTarget).protocol)) {
  throw new Error('WEATHER_API_PROXY must be an HTTP or HTTPS backend origin.')
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiTarget ? { '/api': { target: apiTarget, changeOrigin: false } } : undefined,
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
