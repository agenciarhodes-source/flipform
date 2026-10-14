import 'server-only';

import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

/**
 * The customer's own business token, saved when the WhatsApp was connected. Meta documents this
 * token for every call a Tech Provider makes on the customer's account. Connections made before
 * it was saved have none and keep using the platform credential.
 */
export function connectionAccessToken(encrypted: string | null | undefined): string | null {
  return decryptIntegrationSecret(encrypted) || null;
}

/** Applied whenever a connection is revoked: the customer's credential goes with it. */
export const CLEARED_CONNECTION_CREDENTIAL = { accessTokenEncrypted: null } as const;
