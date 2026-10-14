import { NextRequest, NextResponse } from 'next/server';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getPlatformWhatsAppEmbeddedSignupCredentials } from '@/lib/meta/platform-settings';
import { META_WHATSAPP_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { verifyMetaOAuthStateForPurposeWithContext } from '@/lib/meta/oauth-state';
import { WHATSAPP_ONBOARDING_MODES, whatsappOnboardingStateContext } from '@/lib/meta/whatsapp-onboarding';
import { WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH } from '@/lib/meta/whatsapp-signup-state';
import {
  exchangeWhatsAppEmbeddedSignupCode,
  subscribeAppToWhatsAppWaba,
  validateWhatsAppEmbeddedSignupToken,
  validateWhatsAppSystemUserToken,
  validateWhatsAppWabaPhoneSelection,
} from '@/lib/meta/whatsapp';

const idSchema = z.string().trim().regex(/^\d{1,64}$/);
const bodySchema = z.object({
  code: z.string().trim().min(8).max(4096),
  state: z.string().trim().min(16).max(256),
  wabaId: idSchema,
  // Meta does not return the number when an existing WhatsApp Business app is connected.
  phoneNumberId: idSchema.optional(),
  onboardingMode: z.enum(WHATSAPP_ONBOARDING_MODES),
}).strict().refine((body) => body.onboardingMode === 'coexistence' || Boolean(body.phoneNumberId));

function clearSignupState(response: NextResponse) {
  response.cookies.set(WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-embedded-signup-complete:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Conclusão do WhatsApp inválida.' }, { status: 400 });

  const stateValid = verifyMetaOAuthStateForPurposeWithContext(
    req.cookies.get(WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE)?.value,
    parsed.data.state,
    session.tenantId,
    session.userId,
    META_WHATSAPP_ONBOARDING_PURPOSE,
    whatsappOnboardingStateContext(parsed.data.onboardingMode),
  );
  if (!stateValid) {
    return clearSignupState(NextResponse.json({ error: 'Sessão de conexão do WhatsApp inválida ou expirada.' }, { status: 403 }));
  }

  // Which step was running when the connection failed, kept so a failure can be explained.
  let step = 'platform_credentials';
  try {
    const credentials = await getPlatformWhatsAppEmbeddedSignupCredentials();
    if (!credentials) {
      return clearSignupState(NextResponse.json({ error: 'O WhatsApp Embedded Signup não está configurado pela plataforma.' }, { status: 503 }));
    }

    // The Embedded Signup user token is short-lived onboarding evidence only.
    // Meta documents /debug_token with a System User Access Token authorizing
    // the request, so the transient user token is never used as the debugger.
    step = 'exchange_code';
    const exchanged = await exchangeWhatsAppEmbeddedSignupCode({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      code: parsed.data.code,
    });
    step = 'validate_signup_token';
    const onboardingValidation = await validateWhatsAppEmbeddedSignupToken({
      accessToken: exchanged.accessToken,
      debugAccessToken: credentials.systemUserAccessToken,
      appId: credentials.appId,
      wabaId: parsed.data.wabaId,
    });
    step = 'validate_signup_selection';
    const onboardingSelection = await validateWhatsAppWabaPhoneSelection({
      accessToken: exchanged.accessToken,
      appSecret: credentials.appSecret,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
    });

    const conflictingConnection = await prisma.tenantWhatsAppConnection.findFirst({
      where: {
        tenantId: { not: session.tenantId },
        OR: [
          { wabaId: onboardingSelection.waba.id },
          { phoneNumberId: onboardingSelection.phone.id },
        ],
      },
      select: { id: true },
    });
    if (conflictingConnection) {
      return clearSignupState(NextResponse.json({ error: 'Este WhatsApp já está vinculado a outra empresa no FlipForm.' }, { status: 409 }));
    }

    // Meta's Tech Provider flow: the business token returned to this signup is the customer's own
    // never-expiring credential for its WhatsApp account, and every later call uses it. Adding the
    // platform user to the customer's account needed an advanced permission the app does not have.
    const runtimeToken = exchanged.accessToken;
    step = 'validate_runtime_token';
    const runtimeValidation = await validateWhatsAppSystemUserToken({
      accessToken: runtimeToken,
      debugAccessToken: credentials.systemUserAccessToken,
      appId: credentials.appId,
      wabaId: onboardingSelection.waba.id,
    });
    step = 'validate_runtime_selection';
    const runtimeSelection = await validateWhatsAppWabaPhoneSelection({
      accessToken: runtimeToken,
      appSecret: credentials.appSecret,
      wabaId: onboardingSelection.waba.id,
      phoneNumberId: onboardingSelection.phone.id,
    });
    step = 'subscribe_app';
    await subscribeAppToWhatsAppWaba({
      accessToken: runtimeToken,
      appSecret: credentials.appSecret,
      wabaId: runtimeSelection.waba.id,
    });

    const now = new Date();
    step = 'save_connection';
    const connection = await prisma.$transaction(async tx => {
      // Serialize all connection replacements for one tenant. Without this lock,
      // two concurrent signups could both revoke the previous row and then leave
      // two active bindings. The project already uses this PostgreSQL FOR UPDATE
      // pattern for lead-assignment serialization.
      const lockedTenant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM public.tenants
        WHERE id = ${session.tenantId}
        FOR UPDATE
      `;
      if (!lockedTenant[0]) throw new Error('WhatsApp tenant not found during binding');

      const previousBinding = await tx.tenantWhatsAppConnection.findFirst({
        where: { tenantId: session.tenantId },
        orderBy: { connectedAt: 'desc' },
        select: { id: true, status: true, wabaId: true, phoneNumberId: true },
      });

      // A WABA may contain multiple phone numbers. Reuse the historical row for
      // the same tenant/WABA so selecting another phone does not collide with the
      // global unique wabaId constraint.
      const reusableBinding = await tx.tenantWhatsAppConnection.findFirst({
        where: { tenantId: session.tenantId, wabaId: runtimeSelection.waba.id },
        select: { id: true },
      });

      await tx.tenantWhatsAppConnection.updateMany({
        where: {
          tenantId: session.tenantId,
          status: 'connected',
          ...(reusableBinding ? { id: { not: reusableBinding.id } } : {}),
        },
        // A replaced connection no longer keeps the customer's credential.
        data: { status: 'revoked', revokedAt: now, accessTokenEncrypted: null },
      });

      const connectionData = {
        status: 'connected',
        wabaId: runtimeSelection.waba.id,
        wabaName: runtimeSelection.waba.name,
        phoneNumberId: runtimeSelection.phone.id,
        displayPhoneNumber: runtimeSelection.phone.displayPhoneNumber,
        verifiedName: runtimeSelection.phone.verifiedName,
        qualityRating: runtimeSelection.phone.qualityRating,
        connectedAt: now,
        // Marks when the platform was authorized on this account; with the business token that is now.
        systemUserAssignedAt: now,
        accessTokenEncrypted: encryptIntegrationSecret(runtimeToken),
        subscribedAt: now,
        lastValidatedAt: now,
        revokedAt: null,
      };

      const saved = reusableBinding
        ? await tx.tenantWhatsAppConnection.update({
            where: { id: reusableBinding.id },
            data: connectionData,
          })
        : await tx.tenantWhatsAppConnection.create({
            data: { tenantId: session.tenantId, ...connectionData },
          });

      await tx.auditLog.create({
        data: {
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'tenant_whatsapp_connection',
          entityId: saved.id,
          action: 'WHATSAPP_EMBEDDED_SIGNUP_CONNECTED',
          metadata: {
            wabaId: runtimeSelection.waba.id,
            wabaName: runtimeSelection.waba.name,
            phoneNumberId: runtimeSelection.phone.id,
            displayPhoneNumber: runtimeSelection.phone.displayPhoneNumber,
            verifiedName: runtimeSelection.phone.verifiedName,
            previousWabaId: previousBinding?.wabaId ?? null,
            previousPhoneNumberId: previousBinding?.phoneNumberId ?? null,
            previousStatus: previousBinding?.status ?? null,
            onboardingScopeCount: onboardingValidation.grantedScopes.length,
            runtimeScopeCount: runtimeValidation.grantedScopes.length,
            credentialMode: 'business_token',
            onboardingMode: parsed.data.onboardingMode,
          } as any,
        },
      });
      return saved;
    });

    console.info('WhatsApp Embedded Signup completed', {
      tenantId: session.tenantId,
      connectionId: connection.id,
      credentialMode: 'business_token',
      onboardingMode: parsed.data.onboardingMode,
      hasDisplayPhoneNumber: Boolean(connection.displayPhoneNumber),
      onboardingScopeCount: onboardingValidation.grantedScopes.length,
      runtimeScopeCount: runtimeValidation.grantedScopes.length,
    });

    return clearSignupState(NextResponse.json({
      connection: {
        status: connection.status,
        wabaName: connection.wabaName,
        displayPhoneNumber: connection.displayPhoneNumber,
        verifiedName: connection.verifiedName,
        qualityRating: connection.qualityRating,
        connectedAt: connection.connectedAt,
        subscribedAt: connection.subscribedAt,
        onboardingMode: parsed.data.onboardingMode,
      },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return clearSignupState(NextResponse.json({ error: 'Este WABA ou número de WhatsApp já está vinculado no FlipForm.' }, { status: 409 }));
    }
    const provider = error as Error & { status?: number; providerCode?: string | number | null; providerType?: string | null };
    const failure = {
      step,
      onboardingMode: parsed.data.onboardingMode,
      // Messages raised by the Meta helpers name the operation only; they never carry tokens.
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      httpStatus: typeof provider?.status === 'number' ? provider.status : null,
      providerCode: provider?.providerCode == null ? null : String(provider.providerCode),
      providerType: provider?.providerType ?? null,
    };
    console.error('WhatsApp Embedded Signup completion failed', {
      tenantId: session.tenantId,
      operation: 'complete_embedded_signup',
      errorType: error instanceof Error ? error.name : 'unknown',
      ...failure,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'whatsapp_connection',
        entityId: session.tenantId,
        action: 'whatsapp.embedded_signup.failed',
        metadata: failure,
      },
    }).catch(() => undefined);
    return clearSignupState(NextResponse.json({ error: 'Não foi possível concluir a conexão do WhatsApp com a Meta.' }, { status: 502 }));
  }
});
