// Non-secret, safe-to-expose public values (Supabase anon key & LiveKit ws url
// are designed to be public). Real per-environment overrides can be set via
// Vercel project env vars of the same name.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plkusxbemhdbydejycay.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_MAg0oxXMXuhbriHgyYZ9WA_VCSi5lyv';

export const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://auav-streaming-portal-tsrffsxc.livekit.cloud';
