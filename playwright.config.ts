import { defineConfig, devices } from '@playwright/test';
import { LOCAL_ANON_KEY, LOCAL_SERVICE_KEY, SUPABASE_URL } from './tests/e2e/local-env';

// e2e always runs against the LOCAL Supabase stack, never the project in .env.local: the app is built and served
// on its own port with local env (process env wins over .env.local), so a `pnpm dev` on :3000 is left alone.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    // PW_REUSE_SERVER=1 lets a slow machine build + start the server once by hand (same env as below) and reuse it.
    reuseExistingServer: !!process.env.PW_REUSE_SERVER,
    timeout: 600_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_KEY,
      APP_URL: baseURL,
    },
  },
});
