import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// Where Supabase's invite (and future magic-link/recovery) emails land.
// The email link is `{redirectTo}?token_hash=...&type=...` -- we exchange
// that token for a real session here, then hand off to `next`.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const errorUrl = new URL('/login', request.url);
  errorUrl.searchParams.set('error', 'invite_link_invalid');
  return NextResponse.redirect(errorUrl);
}
