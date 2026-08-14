import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { exchangeMetaAuthorizationCode, exchangeMetaUserAccessTokenForLongLived, validateMetaAuthorization } from '@/lib/meta/oauth';
import { getMetaUserProfile } from '@/lib/meta/profile';
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

    const exchanged = await exchangeMetaAuthorizationCode({ ...credentials, redirectUri: getMetaOAuthRedirectUri(), code });
    let accessToken = exchanged.accessToken;
    let validation = await validateMetaAuthorization({ accessToken, appId: credentials.appId, appSecret: credentials.appSecret });
    let userTokenExtended = false;

    if (validation.tokenType === 'USER') {
      const longLived = await exchangeMetaUserAccessTokenForLongLived({
        appId: credentials.appId,
        appSecret: credentials.appSecret,
        accessToken,
      });
      accessToken = longLived.accessToken;
      validation = await validateMetaAuthorization({ accessToken, appId: credentials.appId, appSecret: credentials.appSecret });
      userTokenExtended = true;
    }

    const profile = validation.tokenType === 'USER'
      ? await getMetaUserProfile({ accessToken, appSecret: credentials.appSecret })
      : null;
    const metaUserName = profile?.id === validation.metaUserId ? profile.name : validation.metaUserName;

    const now = new Date();
    const status = validation.authorizationSatisfied ? 'authorized' : 'error';
    const encrypted = encryptIntegrationSecret(accessToken);
    console.info('Meta Business Login validation completed', {
      tenantId: session.tenantId,
      tokenType: validation.diagnostics.tokenType,
      authorizationMethod: validation.diagnostics.authorizationMethod,
      authorizationSatisfied: validation.authorizationSatisfied,
      userTokenExtended,
      effectiveScopeCount: validation.diagnostics.effectiveScopes.length,
      missingScopes: validation.diagnostics.missingScopes,
      granularScopeNames: validation.diagnostics.granularScopeNames,
      granularTargetCounts: validation.diagnostics.granularTargetCounts,
      systemUserAssetAccess: validation.diagnostics.systemUserAssetAccess,
      hasExpiration: validation.diagnostics.hasExpiration,
      hasProfileName: Boolean(metaUserName),
    });
    await prisma.$transaction(async tx => {
      await tx.tenantMetaConnection.updateMany({
        where: { tenantId: session.tenantId, status: 'authorized', metaUserId: { not: validation.metaUserId } },
        data: { status: 'revoked', revokedAt: now },
      });
      await tx.tenantMetaConnection.upsert({
        where: { tenantId_metaUserId: { tenantId: session.tenantId, metaUserId: validation.metaUserId } },
        create: {
          tenantId: session.tenantId,
          status,
          metaUserId: validation.metaUserId,
          metaUserName,
          accessTokenEncrypted: encrypted,
          grantedScopes: validation.grantedScopes,
          tokenExpiresAt: validation.tokenExpiresAt,
          connectedById: session.userId,
          connectedAt: now,
          lastValidatedAt: now,
        },
        update: {
          status,
          metaUserName,
          accessTokenEncrypted: encrypted,
          grantedScopes: validation.grantedScopes,
          tokenExpiresAt: validation.tokenExpiresAt,
          connectedById: session.userId,
          connectedAt: now,
          lastValidatedAt: now,
          revokedAt: null,
          metaBusinessId: null,
          metaBusinessName: null,
          metaAdAccountId: null,
          metaAdAccountName: null,
          metaPixelId: null,
          metaPixelName: null,
          assetsSelectedAt: null,
        },
      });
    });
    return clearState(redirect(status === 'authorized' ? 'authorized' : 'permissions'));
  } catch (error) {
    console.error('Meta OAuth callback failed', { tenantId: session.tenantId, operation: 'callback', errorType: error instanceof Error ? error.name : 'unknown' });
    return clearState(redirect('error'));
  }
});
