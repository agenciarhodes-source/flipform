import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getMetaOAuthRedirectUri, getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import { buildMetaAuthorizationUrl } from '@/lib/meta/oauth';
import { META_ADS_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { createMetaOAuthStateForPurpose, META_OAUTH_STATE_COOKIE, META_OAUTH_STATE_COOKIE_PATH, META_OAUTH_STATE_TTL_SECONDS } from '@/lib/meta/oauth-state';

export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `meta-oauth-connect:${session.tenantId}:${getClientIp(req)}`, limit: 10, windowMs: 10 * 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const currentConnection = await prisma.tenantMetaConnection.findFirst({
    where: { tenantId: session.tenantId, status: 'authorized' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true },
  });
  if (currentConnection) {
    const latestAuthorization = await prisma.auditLog.findFirst({
      where: {
        entityType: 'tenant_meta_connection',
        entityId: currentConnection.id,
        action: { in: ['META_PLATFORM_AUTHORIZATION_CONNECTED', 'META_CLIENT_AUTHORIZATION_CONNECTED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true },
    });
    if (latestAuthorization?.action === 'META_PLATFORM_AUTHORIZATION_CONNECTED') {
      return NextResponse.json({
        error: 'Esta conexão Meta é gerenciada pela plataforma e só pode ser reautorizada pelo administrador do FlipForm.',
        code: 'META_CONNECTION_PLATFORM_MANAGED',
      }, { status: 403 });
    }
  }

  const credentials = await getPlatformMetaOAuthCredentials();
  if (!credentials?.businessLoginConfigId) return NextResponse.json({ error: 'A conexão empresarial da Meta ainda não foi configurada pela plataforma.' }, { status: 503 });

  // This endpoint is intentionally Ads/Pixel only and client-authorized.
  // Platform-managed tenant authorization starts only from the Super Admin.
  // WhatsApp and Instagram receive separate official onboarding routes and
  // independent token lifecycles.
  const oauthState = createMetaOAuthStateForPurpose(
    session.tenantId,
    session.userId,
    META_ADS_ONBOARDING_PURPOSE,
  );
  const authorizationUrl = buildMetaAuthorizationUrl({ appId: credentials.appId, redirectUri: getMetaOAuthRedirectUri(), state: oauthState.state, businessLoginConfigId: credentials.businessLoginConfigId });
  const response = NextResponse.json({ authorizationUrl });
  response.cookies.set(META_OAUTH_STATE_COOKIE, oauthState.cookie, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: META_OAUTH_STATE_COOKIE_PATH, maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
