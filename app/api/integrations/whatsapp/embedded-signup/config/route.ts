import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getPlatformWhatsAppEmbeddedSignupCredentials } from '@/lib/meta/platform-settings';
import { META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';
import { META_WHATSAPP_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { createMetaOAuthStateForPurpose, META_OAUTH_STATE_TTL_SECONDS } from '@/lib/meta/oauth-state';
import { WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH } from '@/lib/meta/whatsapp-signup-state';

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-embedded-signup-config:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const credentials = await getPlatformWhatsAppEmbeddedSignupCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'O WhatsApp Embedded Signup ainda não foi configurado pela plataforma.' }, { status: 503 });
  }

  const signupState = createMetaOAuthStateForPurpose(
    session.tenantId,
    session.userId,
    META_WHATSAPP_ONBOARDING_PURPOSE,
  );
  const response = NextResponse.json({
    appId: credentials.appId,
    configId: credentials.configId,
    graphApiVersion: META_PLATFORM_GRAPH_API_VERSION,
    state: signupState.state,
  });
  response.cookies.set(WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, signupState.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH,
    maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
