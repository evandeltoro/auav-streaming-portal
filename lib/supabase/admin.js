import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

// Server-only privileged client, used strictly for operations that must
// bypass RLS by design: writing recordings from the webhook handler, and
// generating signed URLs against the private recordings bucket. Never
// import this from client components or expose the service role key to
// the browser.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured on the server');
  }
  return createSupabaseClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
