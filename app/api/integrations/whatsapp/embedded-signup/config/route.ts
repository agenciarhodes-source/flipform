import { NextRequest, NextResponse } from 'next/server';
import { messagingPlanRequired, tenantHasMessagingPlan } from '@/lib/billing/plan-access';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getPlatformWhatsAppEmbeddedSignupClientConfig } from '@/lib/meta/platform-settings';
import { META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';
import { META_WHATSAPP_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { createMetaOAuthStateForPurposeWithContext, META_OAUTH_STATE_TTL_SECONDS } from '@/lib/meta/oauth-state';
import { WHATSAPP_ONBOARDING_MODES, whatsappOnboardingStateContext } from '@/lib/meta/whatsapp-onboarding';
import { WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH } from '@/lib/meta/whatsapp-signup-state';

// Connecting an existing WhatsApp Business app may need a Meta configuration of its own.
// When the platform sets one, only that flow uses it; a new number keeps the main configuration.
function coexistenceConfigId(onboardingMode: string) {
  if (onboardingMode !== 'coexistence') return null;
  const configured = process.env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || '';
  return /^\d{5,32}$/.test(configured) ? configured : null;
}

const bodySchema = z.object({
  onboardingMode: z.enum(WHATSAPP_ONBOARDING_MODES),
}).strict();

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  if (!(await tenantHasMessagingPlan(session.tenantId))) return messagingPlanRequired();
  const rl = await rateLimit({
    key: `whatsapp-embedded-signup-config:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Escolha uma forma válida de conectar o WhatsApp.' }, { status: 400 });
  }

  const config = await getPlatformWhatsAppEmbeddedSignupClientConfig();
  if (!config) {
    return NextResponse.json({ error: 'O WhatsApp Embedded Signup ainda não foi configurado pela plataforma.' }, { status: 503 });
  }

  const signupState = createMetaOAuthStateForPurposeWithContext(
    session.tenantId,
    session.userId,
    META_WHATSAPP_ONBOARDING_PURPOSE,
    whatsappOnboardingStateContext(parsed.data.onboardingMode),
  );
  const response = NextResponse.json({
    appId: config.appId,
    configId: coexistenceConfigId(parsed.data.onboardingMode) || config.configId,
    graphApiVersion: META_PLATFORM_GRAPH_API_VERSION,
    state: signupState.state,
    onboardingMode: parsed.data.onboardingMode,
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
