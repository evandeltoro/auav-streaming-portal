import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabase/config';

// /auth/callback is hit by invite/magic-link emails before the visitor has
// a session -- it's the thing that CREATES the session, so it can't
// require one first.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/signup'];

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // Preserve where the user was headed (path + query) so login can send
    // them back afterward instead of always landing on the home page.
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const next = request.nextUrl.searchParams.get('next');
    const url = request.nextUrl.clone();
    url.pathname = next && next.startsWith('/') ? next.split('?')[0] : '/';
    url.search = next && next.includes('?') ? next.split('?')[1] : '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.png$).*)'],
};
