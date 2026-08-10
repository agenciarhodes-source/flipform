import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { exchangeMetaAuthorizationCode, validateMetaAuthorization } from '@/lib/meta/oauth';
import { getMetaOAuthRedirectUri, getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import { META_OAUTH_STATE_COOKIE, META_OAUTH_STATE_COOKIE_PATH, verifyMetaOAuthState } from '@/lib/meta/oauth-state';

function redirect(result: 'authorized' | 'cancelled' | 'permissions' | 'error') {
  return NextResponse.redirect(new URL(`/integrations?meta=${result}`, getMetaOAuthRedirectUri()));
}
function clearState(response: NextResponse) {
  response.cookies.set(META_OAUTH_STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: META_OAUTH_STATE_COOKIE_PATH, maxAge: 0 });
  return response;
}

export const GET = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `meta-oauth-callback:${session.tenantId}:${getClientIp(req)}`, limit: 20, windowMs: 10 * 60_000 });
  if (!rl.allowed) return clearState(redirect('error'));
  const stateValid = verifyMetaOAuthState(req.cookies.get(META_OAUTH_STATE_COOKIE)?.value, req.nextUrl.searchParams.get('state'), session.tenantId, session.userId);
  if (!stateValid) return clearState(redirect('error'));
  if (req.nextUrl.searchParams.has('error')) return clearState(redirect(req.nextUrl.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'error'));
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return clearState(redirect('error'));
  try {
    const credentials = await getPlatformMetaOAuthCredentials();
    if (!credentials) return clearState(redirect('error'));
    const token = await exchangeMetaAuthorizationCode({ ...credentials, redirectUri: getMetaOAuthRedirectUri(), code });
    const validation = await validateMetaAuthorization(token.accessToken, credentials.appSecret);
    const now = new Date();
    const status = validation.missingScopes.length ? 'error' : 'authorized';
    const encrypted = encryptIntegrationSecret(token.accessToken);
    await prisma.$transaction(async tx => {
      await tx.tenantMetaConnection.updateMany({
        where: { tenantId: session.tenantId, status: 'authorized', metaUserId: { not: validation.metaUserId } },
        data: { status: 'revoked', revokedAt: now },
      });
      await tx.tenantMetaConnection.upsert({
        where: { tenantId_metaUserId: { tenantId: session.tenantId, metaUserId: validation.metaUserId } },
        create: { tenantId: session.tenantId, status, metaUserId: validation.metaUserId, metaUserName: validation.metaUserName, accessTokenEncrypted: encrypted, grantedScopes: validation.grantedScopes, tokenExpiresAt: token.expiresIn ? new Date(now.getTime() + token.expiresIn * 1000) : null, connectedById: session.userId, connectedAt: now, lastValidatedAt: now },
        update: { status, metaUserName: validation.metaUserName, accessTokenEncrypted: encrypted, grantedScopes: validation.grantedScopes, tokenExpiresAt: token.expiresIn ? new Date(now.getTime() + token.expiresIn * 1000) : null, connectedById: session.userId, connectedAt: now, lastValidatedAt: now, revokedAt: null },
      });
    });
    return clearState(redirect(status === 'authorized' ? 'authorized' : 'permissions'));
  } catch (error) {
    console.error('Meta OAuth callback failed', { tenantId: session.tenantId, operation: 'callback', errorType: error instanceof Error ? error.name : 'unknown' });
    return clearState(redirect('error'));
  }
});
