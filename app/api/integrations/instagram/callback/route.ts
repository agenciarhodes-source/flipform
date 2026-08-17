import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { verifyMetaOAuthStateForPurpose } from '@/lib/meta/oauth-state';
import { META_INSTAGRAM_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import {
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  INSTAGRAM_WEBHOOK_FIELDS,
  subscribeInstagramWebhooks,
  validateInstagramProfessionalAccount,
} from '@/lib/meta/instagram';
import {
  getInstagramOAuthRedirectUri,
  getPlatformInstagramLoginCredentials,
} from '@/lib/meta/instagram-platform';
import { persistInstagramConnection } from '@/lib/meta/instagram-connection';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_COOKIE_PATH,
} from '@/lib/meta/instagram-state';

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function redirect(result: 'connected' | 'cancelled' | 'permissions' | 'conflict' | 'error') {
  return NextResponse.redirect(new URL(`/integrations?instagram=${result}`, appBaseUrl()));
}

function clearState(response: NextResponse) {
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: INSTAGRAM_OAUTH_STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export const GET = withAuth(async (req: NextRequest, session) => {
  if (!can(session.role, 'INTEGRATIONS_EDIT')) return clearState(redirect('error'));

  const state = req.nextUrl.searchParams.get('state');
  const validState = verifyMetaOAuthStateForPurpose(
    req.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value,
    state,
    session.tenantId,
    session.userId,
    META_INSTAGRAM_ONBOARDING_PURPOSE,
  );
  if (!validState) return clearState(redirect('error'));

  const rl = rateLimit({
    key: `instagram-business-login-callback:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return clearState(redirect('error'));

  if (req.nextUrl.searchParams.has('error')) {
    const denied = req.nextUrl.searchParams.get('error') === 'access_denied'
      || req.nextUrl.searchParams.get('error_reason') === 'user_denied';
    return clearState(redirect(denied ? 'cancelled' : 'error'));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) return clearState(redirect('error'));

  try {
    const credentials = await getPlatformInstagramLoginCredentials();
    if (!credentials) return clearState(redirect('error'));

    const shortLived = await exchangeInstagramAuthorizationCode({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      redirectUri: getInstagramOAuthRedirectUri(),
      code,
    });
    const longLived = await exchangeInstagramLongLivedToken({
      appSecret: credentials.appSecret,
      accessToken: shortLived.accessToken,
    });
    const account = await validateInstagramProfessionalAccount({ accessToken: longLived.accessToken });

    if (shortLived.instagramUserId && shortLived.instagramUserId !== account.instagramUserId) {
      throw new Error('Instagram OAuth user does not match validated professional account');
    }

    await subscribeInstagramWebhooks({
      instagramUserId: account.instagramUserId,
      accessToken: longLived.accessToken,
    });

    const tokenExpiresAt = longLived.expiresInSeconds
      ? new Date(Date.now() + longLived.expiresInSeconds * 1000)
      : null;

    await persistInstagramConnection({
      tenantId: session.tenantId,
      instagramUserId: account.instagramUserId,
      username: account.username,
      accessTokenEncrypted: encryptIntegrationSecret(longLived.accessToken),
      tokenExpiresAt,
      connectedById: session.userId,
      webhookFields: INSTAGRAM_WEBHOOK_FIELDS,
    });

    console.info('Instagram Business Login connected', {
      tenantId: session.tenantId,
      instagramUserId: account.instagramUserId,
      username: account.username,
      onboardingPurpose: META_INSTAGRAM_ONBOARDING_PURPOSE,
      webhookFields: INSTAGRAM_WEBHOOK_FIELDS,
      hasExpiration: Boolean(tokenExpiresAt),
    });
    return clearState(redirect('connected'));
  } catch (error) {
    const conflict = error instanceof Error && error.message === 'INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT';
    const permissions = error instanceof Error && (
      error.message.includes('messaging_permission_validation')
      || error.message.includes('webhook_subscription')
    );
    console.error('Instagram Business Login callback failed', {
      tenantId: session.tenantId,
      onboardingPurpose: META_INSTAGRAM_ONBOARDING_PURPOSE,
      operation: 'callback',
      errorType: error instanceof Error ? error.name : 'unknown',
      conflict,
      permissions,
    });
    return clearState(redirect(conflict ? 'conflict' : permissions ? 'permissions' : 'error'));
  }
});
