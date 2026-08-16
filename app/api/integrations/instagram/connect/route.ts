import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createMetaOAuthStateForPurpose, META_OAUTH_STATE_TTL_SECONDS } from '@/lib/meta/oauth-state';
import { META_INSTAGRAM_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { buildInstagramAuthorizationUrl } from '@/lib/meta/instagram';
import {
  getInstagramOAuthRedirectUri,
  getPlatformInstagramLoginCredentials,
} from '@/lib/meta/instagram-platform';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_COOKIE_PATH,
} from '@/lib/meta/instagram-state';

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `instagram-business-login:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const credentials = await getPlatformInstagramLoginCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'O Instagram ainda não foi configurado pela plataforma.' }, { status: 503 });
  }

  const created = createMetaOAuthStateForPurpose(
    session.tenantId,
    session.userId,
    META_INSTAGRAM_ONBOARDING_PURPOSE,
  );
  const authorizationUrl = buildInstagramAuthorizationUrl({
    appId: credentials.appId,
    redirectUri: getInstagramOAuthRedirectUri(),
    state: created.state,
  });

  const response = NextResponse.json({ authorizationUrl });
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, created.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: INSTAGRAM_OAUTH_STATE_COOKIE_PATH,
    maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
