import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'app.html')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      RESEND_API_KEY: 'test-resend-key',
      DIRECTFREIGHT_API_TOKEN: 'df-test-key',
      VITE_APP_URL: 'https://app.haulmonitor.cloud',
    },
  }
})
