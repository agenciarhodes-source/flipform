import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import {
  registerWhatsAppPhoneNumber,
  validateWhatsAppSystemUserToken,
  validateWhatsAppWabaPhoneSelection,
} from '@/lib/meta/whatsapp';

const bodySchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
}).strict();

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-phone-registration:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe um PIN de 6 dígitos.' }, { status: 400 });
  }

  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId: session.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true, wabaId: true, phoneNumberId: true },
  });
  if (!connection) {
    return NextResponse.json({ error: 'Conecte o WhatsApp desta empresa antes de registrar o número.' }, { status: 409 });
  }

  const credentials = await getPlatformWhatsAppRuntimeCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'A credencial técnica do WhatsApp não está configurada pela plataforma.' }, { status: 503 });
  }

  try {
    await validateWhatsAppSystemUserToken({
      accessToken: credentials.systemUserAccessToken,
      debugAccessToken: credentials.systemUserAccessToken,
      appId: credentials.appId,
      wabaId: connection.wabaId,
    });

    // Revalidate the exact server-side binding immediately before registration.
    // The browser never chooses the WABA or Phone Number ID used in this call.
    await validateWhatsAppWabaPhoneSelection({
      accessToken: credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
    });

    await registerWhatsAppPhoneNumber({
      accessToken: credentials.systemUserAccessToken,
      phoneNumberId: connection.phoneNumberId,
      pin: parsed.data.pin,
    });

    const registeredAt = new Date();
    // The PIN is intentionally absent from audit metadata and is never persisted.
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'tenant_whatsapp_connection',
        entityId: connection.id,
        action: 'WHATSAPP_PHONE_REGISTERED',
        metadata: {
          phoneNumberId: connection.phoneNumberId,
          credentialMode: 'platform_system_user',
        },
      },
    }).catch(error => {
      // Meta registration already succeeded. Audit failure must not cause a retry
      // that could change two-step verification state a second time.
      console.error('WhatsApp phone registration audit failed', {
        tenantId: session.tenantId,
        connectionId: connection.id,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    });

    console.info('WhatsApp phone registration completed', {
      tenantId: session.tenantId,
      connectionId: connection.id,
      credentialMode: 'platform_system_user',
    });

    return NextResponse.json({ registered: true, registeredAt });
  } catch (error) {
    console.error('WhatsApp phone registration failed', {
      tenantId: session.tenantId,
      connectionId: connection.id,
      operation: 'register_phone',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível registrar o número na WhatsApp Cloud API.' }, { status: 502 });
  }
});
