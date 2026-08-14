import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { exchangeMetaAuthorizationCode, exchangeMetaUserAccessTokenForLongLived, validateMetaAuthorization } from '@/lib/meta/oauth';
import { META_ADS_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { getMetaUserProfile } from '@/lib/meta/profile';
import { getMetaOAuthRedirectUri, getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import {
  META_OAUTH_STATE_COOKIE,
  META_OAUTH_STATE_COOKIE_PATH,
  readMetaOAuthStateForPurpose,
  type MetaAdsAuthorizationMode,
} from '@/lib/meta/oauth-state';

function redirect(
  result: 'authorized' | 'cancelled' | 'permissions' | 'error',
  authorizationMode: MetaAdsAuthorizationMode,
  tenantId?: string,
) {
  const path = authorizationMode === 'platform_managed'
    ? `/admin/integrations?meta=${result}${tenantId ? `&metaTenant=${encodeURIComponent(tenantId)}` : ''}`
    : `/integrations?meta=${result}`;
  return NextResponse.redirect(new URL(path, getMetaOAuthRedirectUri()));
}
function clearState(response: NextResponse) {
  response.cookies.set(META_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: META_OAUTH_STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export const GET = withAuth(async (req: NextRequest, session) => {
  const statePayload = readMetaOAuthStateForPurpose(
    req.cookies.get(META_OAUTH_STATE_COOKIE)?.value,
    req.nextUrl.searchParams.get('state'),
    session.userId,
    META_ADS_ONBOARDING_PURPOSE,
  );
  if (!statePayload) return clearState(redirect('error', 'client_authorized'));

  const authorizationMode = statePayload.authorizationMode;
  const targetTenantId = statePayload.tenantId;
  const platformManaged = authorizationMode === 'platform_managed';

  if (platformManaged) {
    if (session.globalRole !== 'platform_admin') return clearState(redirect('error', authorizationMode, targetTenantId));
  } else {
    if (session.tenantId !== targetTenantId || !can(session.role, 'INTEGRATIONS_EDIT')) {
      return clearState(redirect('error', authorizationMode));
    }
  }

  const rl = rateLimit({
    key: `meta-oauth-callback:${targetTenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return clearState(redirect('error', authorizationMode, targetTenantId));

  const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId }, select: { id: true } });
  if (!tenant) return clearState(redirect('error', authorizationMode, targetTenantId));

  if (req.nextUrl.searchParams.has('error')) {
    return clearState(redirect(
      req.nextUrl.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'error',
      authorizationMode,
      targetTenantId,
    ));
  }
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return clearState(redirect('error', authorizationMode, targetTenantId));

  try {
    const credentials = await getPlatformMetaOAuthCredentials();
    if (!credentials) return clearState(redirect('error', authorizationMode, targetTenantId));

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
      tenantId: targetTenantId,
      onboardingPurpose: META_ADS_ONBOARDING_PURPOSE,
      authorizationMode,
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
        where: { tenantId: targetTenantId, status: 'authorized', metaUserId: { not: validation.metaUserId } },
        data: { status: 'revoked', revokedAt: now },
      });
      const connection = await tx.tenantMetaConnection.upsert({
        where: { tenantId_metaUserId: { tenantId: targetTenantId, metaUserId: validation.metaUserId } },
        create: {
          tenantId: targetTenantId,
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

      await tx.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId: session.userId,
          entityType: 'tenant_meta_connection',
          entityId: connection.id,
          action: platformManaged ? 'META_PLATFORM_AUTHORIZATION_CONNECTED' : 'META_CLIENT_AUTHORIZATION_CONNECTED',
          metadata: {
            authorizationMode,
            status,
            tokenType: validation.tokenType,
          } as any,
        },
      });
    });

    return clearState(redirect(
      status === 'authorized' ? 'authorized' : 'permissions',
      authorizationMode,
      targetTenantId,
    ));
  } catch (error) {
    console.error('Meta OAuth callback failed', {
      tenantId: targetTenantId,
      onboardingPurpose: META_ADS_ONBOARDING_PURPOSE,
      authorizationMode,
      operation: 'callback',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return clearState(redirect('error', authorizationMode, targetTenantId));
  }
});
