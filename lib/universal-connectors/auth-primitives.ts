import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** Primitives only: real OAuth callbacks require persisted single-use state, actor/session binding,
 * redirect URI and issuer validation, token exchange and provider-specific approval. */
export function makeOAuthPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  return { verifier, state, challenge: createHash('sha256').update(verifier).digest('base64url'), method: 'S256' as const };
}
export function bearerAuthorization(token: string) {
  if (!token || token.length > 8192 || !/^[A-Za-z0-9._~+\/=-]+$/.test(token)) throw new Error('Invalid bearer token');
  return 'Bearer ' + token;
}
