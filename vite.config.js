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
      // NOTE: api/__tests__ is not wired into CI broadly — several pre-existing
      // orgs/integrations tests fail when run (dormant + rotted; see #91). Include
      // the #87 pcmiler auth-gate test explicitly so the security check is covered
      // without unblocking/red-flagging the rest.
      'api/__tests__/pcmiler-auth.test.js',
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
