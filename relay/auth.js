/* ============================================================================
   Supabase token verification
   ----------------------------------------------------------------------------
   The old relay did this:

       const token = socket.handshake.auth.token;
       socket.userId = token;                       // <- believed it

   A Supabase user id is not a secret. It shows up in URLs, logs and shared
   links, so anyone who learned yours could open a socket as you and drive your
   rovers. This module replaces that with a real check: the browser sends its
   Supabase *access token* (a signed JWT) and we ask Supabase who it belongs to.

   Verification is one HTTPS call per connection, not per frame, so it costs
   nothing on the control path. Results are cached until shortly before the
   token expires.
   ============================================================================ */

'use strict';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

/** Set true to run without Supabase — local hacking only, never in production. */
const ALLOW_ANONYMOUS = process.env.ALLOW_ANONYMOUS === '1';

const cache = new Map();          // token -> { user, expiresAt }
const CACHE_SLACK_MS = 60_000;    // drop it a minute before the JWT expires

function decodeExp(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<{ok:true, user:{id:string,email:string}} | {ok:false, reason:string}>}
 */
async function verifyAccessToken(token) {
  if (ALLOW_ANONYMOUS) {
    return { ok: true, user: { id: 'anonymous', email: 'anonymous@local' } };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, reason: 'relay is missing SUPABASE_URL / SUPABASE_ANON_KEY' };
  }
  if (!token || token.split('.').length !== 3) {
    // A bare uuid lands here — which is exactly the old bug being refused.
    return { ok: false, reason: 'not a JWT (send the Supabase access token, not the user id)' };
  }

  const hit = cache.get(token);
  if (hit && Date.now() < hit.expiresAt) return { ok: true, user: hit.user };

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` }
    });
  } catch (e) {
    return { ok: false, reason: `could not reach Supabase: ${e.message}` };
  }

  if (!res.ok) {
    // GoTrue answers 403 for a bad signature and 401 for a missing/expired
    // token; both mean the same thing to us — this caller is not who it says.
    const refused = res.status === 401 || res.status === 403;
    return {
      ok: false,
      reason: refused
        ? 'token rejected by Supabase (expired, forged, or from another project)'
        : `Supabase said ${res.status}`
    };
  }

  const body = await res.json().catch(() => null);
  if (!body || !body.id) return { ok: false, reason: 'malformed user response' };

  const user = { id: body.id, email: body.email || '' };
  const exp = decodeExp(token);
  cache.set(token, {
    user,
    expiresAt: exp ? Math.max(Date.now(), exp - CACHE_SLACK_MS) : Date.now() + 5 * 60_000
  });

  // keep the cache from growing without bound on a long-lived process
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() >= v.expiresAt) cache.delete(k);
  }

  return { ok: true, user };
}

module.exports = { verifyAccessToken, ALLOW_ANONYMOUS };
