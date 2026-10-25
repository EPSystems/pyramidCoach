import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

/** Service-role client. Server only — used for invites and admin flows, never for user data paths. */
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
