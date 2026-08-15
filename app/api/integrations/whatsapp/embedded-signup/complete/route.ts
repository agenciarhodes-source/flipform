import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { getPlatformWhatsAppEmbeddedSignupCredentials } from '@/lib/meta/platform-settings';
import { META_WHATSAPP_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import { verifyMetaOAuthStateForPurpose } from '@/lib/meta/oauth-state';
import { WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE, WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH } from '@/lib/meta/whatsapp-signup-state';
import {
  exchangeWhatsAppEmbeddedSignupCode,
  subscribeAppToWhatsAppWaba,
  validateWhatsAppEmbeddedSignupToken,
  validateWhatsAppWabaPhoneSelection,
} from '@/lib/meta/whatsapp';

const idSchema = z.string().trim().regex(/^\d{1,64}$/);
const bodySchema = z.object({
  code: z.string().trim().min(8).max(4096),
  state: z.string().trim().min(16).max(256),
  wabaId: idSchema,
  phoneNumberId: idSchema,
}).strict();

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

  const stateValid = verifyMetaOAuthStateForPurpose(
    req.cookies.get(WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE)?.value,
    parsed.data.state,
    session.tenantId,
    session.userId,
    META_WHATSAPP_ONBOARDING_PURPOSE,
  );
  if (!stateValid) {
    return clearSignupState(NextResponse.json({ error: 'Sessão de conexão do WhatsApp inválida ou expirada.' }, { status: 403 }));
  }

  try {
    const credentials = await getPlatformWhatsAppEmbeddedSignupCredentials();
    if (!credentials) {
      return clearSignupState(NextResponse.json({ error: 'O WhatsApp Embedded Signup não está configurado pela plataforma.' }, { status: 503 }));
    }

    const exchanged = await exchangeWhatsAppEmbeddedSignupCode({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      code: parsed.data.code,
    });
    const validation = await validateWhatsAppEmbeddedSignupToken({
      accessToken: exchanged.accessToken,
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      wabaId: parsed.data.wabaId,
    });
    const selection = await validateWhatsAppWabaPhoneSelection({
      accessToken: exchanged.accessToken,
      appSecret: credentials.appSecret,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
    });

    const conflictingConnection = await prisma.tenantWhatsAppConnection.findFirst({
      where: {
        tenantId: { not: session.tenantId },
        OR: [
          { wabaId: selection.waba.id },
          { phoneNumberId: selection.phone.id },
        ],
      },
      select: { id: true },
    });
    if (conflictingConnection) {
      return clearSignupState(NextResponse.json({ error: 'Este WhatsApp já está vinculado a outra empresa no FlipForm.' }, { status: 409 }));
    }

    await subscribeAppToWhatsAppWaba({
      accessToken: exchanged.accessToken,
      appSecret: credentials.appSecret,
      wabaId: selection.waba.id,
    });

    const now = new Date();
    const accessTokenEncrypted = encryptIntegrationSecret(exchanged.accessToken);
    const connection = await prisma.$transaction(async tx => {
      await tx.tenantWhatsAppConnection.updateMany({
        where: {
          tenantId: session.tenantId,
          status: 'connected',
          phoneNumberId: { not: selection.phone.id },
        },
        data: { status: 'revoked', revokedAt: now },
      });

      const saved = await tx.tenantWhatsAppConnection.upsert({
        where: { phoneNumberId: selection.phone.id },
        create: {
          tenantId: session.tenantId,
          status: 'connected',
          accessTokenEncrypted,
          tokenExpiresAt: validation.tokenExpiresAt,
          grantedScopes: validation.grantedScopes,
          wabaId: selection.waba.id,
          wabaName: selection.waba.name,
          phoneNumberId: selection.phone.id,
          displayPhoneNumber: selection.phone.displayPhoneNumber,
          verifiedName: selection.phone.verifiedName,
          qualityRating: selection.phone.qualityRating,
          codeVerificationStatus: selection.phone.codeVerificationStatus,
          connectedAt: now,
          subscribedAt: now,
          lastValidatedAt: now,
        },
        update: {
          tenantId: session.tenantId,
          status: 'connected',
          accessTokenEncrypted,
          tokenExpiresAt: validation.tokenExpiresAt,
          grantedScopes: validation.grantedScopes,
          wabaId: selection.waba.id,
          wabaName: selection.waba.name,
          displayPhoneNumber: selection.phone.displayPhoneNumber,
          verifiedName: selection.phone.verifiedName,
          qualityRating: selection.phone.qualityRating,
          codeVerificationStatus: selection.phone.codeVerificationStatus,
          connectedAt: now,
          subscribedAt: now,
          lastValidatedAt: now,
          revokedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'tenant_whatsapp_connection',
          entityId: saved.id,
          action: 'WHATSAPP_EMBEDDED_SIGNUP_CONNECTED',
          metadata: {
            wabaId: selection.waba.id,
            wabaName: selection.waba.name,
            phoneNumberId: selection.phone.id,
            displayPhoneNumber: selection.phone.displayPhoneNumber,
            verifiedName: selection.phone.verifiedName,
          } as any,
        },
      });
      return saved;
    });

    console.info('WhatsApp Embedded Signup completed', {
      tenantId: session.tenantId,
      connectionId: connection.id,
      hasDisplayPhoneNumber: Boolean(connection.displayPhoneNumber),
      tokenHasExpiration: Boolean(connection.tokenExpiresAt),
      grantedScopeCount: validation.grantedScopes.length,
    });

    return clearSignupState(NextResponse.json({
      connection: {
        status: connection.status,
        wabaName: connection.wabaName,
        displayPhoneNumber: connection.displayPhoneNumber,
        verifiedName: connection.verifiedName,
        qualityRating: connection.qualityRating,
        codeVerificationStatus: connection.codeVerificationStatus,
        connectedAt: connection.connectedAt,
        subscribedAt: connection.subscribedAt,
      },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return clearSignupState(NextResponse.json({ error: 'Este WABA ou número de WhatsApp já está vinculado no FlipForm.' }, { status: 409 }));
    }
    console.error('WhatsApp Embedded Signup completion failed', {
      tenantId: session.tenantId,
      operation: 'complete_embedded_signup',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return clearSignupState(NextResponse.json({ error: 'Não foi possível concluir a conexão do WhatsApp com a Meta.' }, { status: 502 }));
  }
});
