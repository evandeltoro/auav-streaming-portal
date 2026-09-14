import crypto from 'crypto';

// No 0/O/1/I/L -- easy to read aloud or type in by hand if someone gets it
// on a whiteboard or text message instead of clicking a link.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

// Shared validity check used by both the public join page (to decide what
// to render) and the redemption route (to decide whether to actually
// create the account) -- kept in one place so those two can't drift.
export function inviteCodeStatus(row) {
  if (!row) return 'not_found';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  if (row.max_uses != null && row.use_count >= row.max_uses) return 'used_up';
  return 'valid';
}
