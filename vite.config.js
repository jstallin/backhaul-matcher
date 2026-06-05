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
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      // api/__tests__ is enabled file-by-file as tests are rehabbed (they were never
      // wired into CI and some rotted — see #91). integrations-truckstop.test.js is
      // still excluded: its mocks predate the Vault migration and need a rewrite.
      'api/__tests__/pcmiler-auth.test.js',
      'api/__tests__/orgs.test.js',
    ],
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
