import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getMetaOAuthRedirectUri, getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import { buildMetaAuthorizationUrl } from '@/lib/meta/oauth';
import { createMetaOAuthState, META_OAUTH_STATE_COOKIE, META_OAUTH_STATE_COOKIE_PATH, META_OAUTH_STATE_TTL_SECONDS } from '@/lib/meta/oauth-state';

export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `meta-oauth-connect:${session.tenantId}:${getClientIp(req)}`, limit: 10, windowMs: 10 * 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const credentials = await getPlatformMetaOAuthCredentials();
  if (!credentials?.businessLoginConfigId) return NextResponse.json({ error: 'A conexão empresarial da Meta ainda não foi configurada pela plataforma.' }, { status: 503 });
  const oauthState = createMetaOAuthState(session.tenantId, session.userId);
  const authorizationUrl = buildMetaAuthorizationUrl({ appId: credentials.appId, redirectUri: getMetaOAuthRedirectUri(), state: oauthState.state, businessLoginConfigId: credentials.businessLoginConfigId });
  const response = NextResponse.json({ authorizationUrl });
  response.cookies.set(META_OAUTH_STATE_COOKIE, oauthState.cookie, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: META_OAUTH_STATE_COOKIE_PATH, maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
