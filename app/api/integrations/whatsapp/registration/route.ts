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

const BINDING_CHANGED = 'WHATSAPP_BINDING_CHANGED';

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
    select: { id: true, wabaId: true, phoneNumberId: true, connectedAt: true },
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

    // Revalidate the exact server-side binding before entering the serialized
    // registration section. The browser never chooses these provider assets.
    await validateWhatsAppWabaPhoneSelection({
      accessToken: credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
    });

    const registration = await prisma.$transaction(async tx => {
      // Embedded Signup completion uses the same tenant row lock. Holding it for
      // the single /register call prevents the reusable binding row from changing
      // phone/version while Meta is registering the snapshot we validated above.
      const lockedTenant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM public.tenants
        WHERE id = ${session.tenantId}
        FOR UPDATE
      `;
      if (!lockedTenant[0]) throw new Error(BINDING_CHANGED);

      const current = await tx.tenantWhatsAppConnection.findFirst({
        where: { tenantId: session.tenantId, status: 'connected' },
        orderBy: { connectedAt: 'desc' },
        select: { id: true, wabaId: true, phoneNumberId: true, connectedAt: true },
      });
      if (
        !current
        || current.id !== connection.id
        || current.wabaId !== connection.wabaId
        || current.phoneNumberId !== connection.phoneNumberId
        || current.connectedAt.getTime() !== connection.connectedAt.getTime()
      ) {
        throw new Error(BINDING_CHANGED);
      }

      await registerWhatsAppPhoneNumber({
        accessToken: credentials.systemUserAccessToken,
        phoneNumberId: current.phoneNumberId,
        pin: parsed.data.pin,
      });

      return {
        connectionId: current.id,
        phoneNumberId: current.phoneNumberId,
        bindingConnectedAt: current.connectedAt.toISOString(),
        registeredAt: new Date(),
      };
    }, { maxWait: 5_000, timeout: 15_000 });

    // The PIN is intentionally absent from audit metadata and is never persisted.
    // Audit is best-effort because Meta has already accepted the registration.
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'tenant_whatsapp_connection',
        entityId: registration.connectionId,
        action: 'WHATSAPP_PHONE_REGISTERED',
        metadata: {
          phoneNumberId: registration.phoneNumberId,
          bindingConnectedAt: registration.bindingConnectedAt,
          credentialMode: 'platform_system_user',
        },
      },
    }).catch(error => {
      console.error('WhatsApp phone registration audit failed', {
        tenantId: session.tenantId,
        connectionId: registration.connectionId,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    });

    console.info('WhatsApp phone registration completed', {
      tenantId: session.tenantId,
      connectionId: registration.connectionId,
      credentialMode: 'platform_system_user',
    });

    return NextResponse.json({ registered: true, registeredAt: registration.registeredAt });
  } catch (error) {
    if (error instanceof Error && error.message === BINDING_CHANGED) {
      return NextResponse.json({
        error: 'A conexão do WhatsApp mudou durante o registro. Recarregue a integração e tente novamente.',
      }, { status: 409 });
    }
    console.error('WhatsApp phone registration failed', {
      tenantId: session.tenantId,
      connectionId: connection.id,
      operation: 'register_phone',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível registrar o número na WhatsApp Cloud API.' }, { status: 502 });
  }
});
