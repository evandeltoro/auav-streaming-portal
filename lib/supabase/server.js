import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // called from a Server Component without write access; middleware
          // handles session refresh so this can be safely ignored
        }
      },
    },
    global: {
      // Next.js patches global fetch() to cache responses by default. Left
      // alone, the first render of a page (e.g. right after deploy, when a
      // list was empty) gets cached and every later request -- including
      // ones after router.refresh() -- keeps serving that same stale
      // result. Every read through this client must reflect the live DB,
      // so force every request to skip the Data Cache.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
