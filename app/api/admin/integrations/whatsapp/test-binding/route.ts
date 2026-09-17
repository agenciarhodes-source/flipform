import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getPlatformWhatsAppEmbeddedSignupCredentials } from '@/lib/meta/platform-settings';
import {
  ensureSystemUserAssignedToWhatsAppWaba,
  subscribeAppToWhatsAppWaba,
  validateWhatsAppSystemUserToken,
  validateWhatsAppWabaPhoneSelection,
} from '@/lib/meta/whatsapp';

const numericId = z.string().trim().regex(/^\d{1,64}$/);
const bodySchema = z.object({
  tenantId: z.string().trim().uuid(),
  wabaId: numericId,
  phoneNumberId: numericId,
  confirmTestAsset: z.literal(true),
}).strict();

class WhatsAppTestBindingConflictError extends Error {
  constructor() {
    super('WHATSAPP_TEST_BINDING_CONFLICT');
    this.name = 'WhatsAppTestBindingConflictError';
  }
}

export const POST = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `admin-whatsapp-test-binding:${session.userId}:${getClientIp(req)}`,
    limit: 12,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas de vínculo de teste. Tente novamente em instantes.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos para o vínculo de teste do WhatsApp.' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });

  const credentials = await getPlatformWhatsAppEmbeddedSignupCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'As credenciais universais do WhatsApp ainda não estão disponíveis no backend.' }, { status: 503 });
  }

  let stage = 'runtime_validation';
  try {
    try {
      await validateWhatsAppSystemUserToken({
        accessToken: credentials.systemUserAccessToken,
        debugAccessToken: credentials.systemUserAccessToken,
        appId: credentials.appId,
        wabaId: parsed.data.wabaId,
      });
    } catch {
      stage = 'system_user_assignment';
      await ensureSystemUserAssignedToWhatsAppWaba({
        adminSystemUserAccessToken: credentials.adminSystemUserAccessToken,
        appSecret: credentials.appSecret,
        wabaId: parsed.data.wabaId,
        businessId: credentials.businessId,
        systemUserId: credentials.systemUserId,
      });
      stage = 'runtime_validation_after_assignment';
      await validateWhatsAppSystemUserToken({
        accessToken: credentials.systemUserAccessToken,
        debugAccessToken: credentials.systemUserAccessToken,
        appId: credentials.appId,
        wabaId: parsed.data.wabaId,
      });
    }

    stage = 'waba_phone_validation';
    const selection = await validateWhatsAppWabaPhoneSelection({
      accessToken: credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
    });

    const conflictingConnection = await prisma.tenantWhatsAppConnection.findFirst({
      where: {
        tenantId: { not: tenant.id },
        OR: [
          { wabaId: selection.waba.id },
          { phoneNumberId: selection.phone.id },
        ],
      },
      select: { id: true, tenantId: true },
    });
    if (conflictingConnection) throw new WhatsAppTestBindingConflictError();

    stage = 'waba_subscription';
    await subscribeAppToWhatsAppWaba({
      accessToken: credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: selection.waba.id,
    });

    const now = new Date();
    stage = 'binding_persistence';
    const connection = await prisma.$transaction(async tx => {
      const lockedTenant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM public.tenants
        WHERE id = ${tenant.id}
        FOR UPDATE
      `;
      if (!lockedTenant[0]) throw new Error('WhatsApp test tenant disappeared during binding');

      const reusableBinding = await tx.tenantWhatsAppConnection.findFirst({
        where: { tenantId: tenant.id, wabaId: selection.waba.id },
        select: { id: true },
      });

      await tx.tenantWhatsAppConnection.updateMany({
        where: {
          tenantId: tenant.id,
          status: 'connected',
          ...(reusableBinding ? { id: { not: reusableBinding.id } } : {}),
        },
        data: { status: 'revoked', revokedAt: now },
      });

      const connectionData = {
        status: 'connected',
        wabaId: selection.waba.id,
        wabaName: selection.waba.name,
        phoneNumberId: selection.phone.id,
        displayPhoneNumber: selection.phone.displayPhoneNumber,
        verifiedName: selection.phone.verifiedName,
        qualityRating: selection.phone.qualityRating,
        connectedAt: now,
        systemUserAssignedAt: now,
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
            data: { tenantId: tenant.id, ...connectionData },
          });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: session.userId,
          entityType: 'tenant_whatsapp_connection',
          entityId: saved.id,
          action: 'WHATSAPP_META_TEST_NUMBER_BOUND',
          metadata: {
            source: 'platform_admin_smoke_test',
            wabaId: selection.waba.id,
            phoneNumberId: selection.phone.id,
            displayPhoneNumber: selection.phone.displayPhoneNumber,
            verifiedName: selection.phone.verifiedName,
          } as Prisma.InputJsonValue,
        },
      });

      // The Meta-provided test number is already provisioned for Cloud API use.
      // This audit marker lets the existing tenant health UI treat the smoke-test
      // binding as operational without storing a PIN or any temporary user token.
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: session.userId,
          entityType: 'tenant_whatsapp_connection',
          entityId: saved.id,
          action: 'WHATSAPP_PHONE_REGISTERED',
          metadata: {
            phoneNumberId: selection.phone.id,
            bindingConnectedAt: now.toISOString(),
            source: 'meta_test_number',
          } as Prisma.InputJsonValue,
        },
      });

      return saved;
    });

    return NextResponse.json({
      tenant,
      connection: {
        id: connection.id,
        status: connection.status,
        wabaName: connection.wabaName,
        displayPhoneNumber: connection.displayPhoneNumber,
        verifiedName: connection.verifiedName,
        qualityRating: connection.qualityRating,
        connectedAt: connection.connectedAt,
      },
      nextStep: 'Responda no WhatsApp para o número de teste da Meta e abra o Inbox do tenant.',
    });
  } catch (error) {
    if (error instanceof WhatsAppTestBindingConflictError) {
      return NextResponse.json({ error: 'Esse WABA ou número de teste já está vinculado a outro tenant no FlipForm.' }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Esse WABA ou número de teste já está vinculado no FlipForm.' }, { status: 409 });
    }

    console.error('Admin WhatsApp test-number binding failed', {
      tenantId: tenant.id,
      operation: 'bind_meta_test_number',
      stage,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({
      error: stage === 'system_user_assignment'
        ? 'O System User universal ainda não pôde ser atribuído ao WABA de teste. Verifique a liberação da Meta para a credencial administrativa.'
        : stage.startsWith('runtime_validation')
          ? 'O token universal de runtime ainda não consegue operar o WABA de teste.'
          : stage === 'waba_phone_validation'
            ? 'O WABA ou Phone Number ID de teste não pôde ser validado com a credencial universal.'
            : stage === 'waba_subscription'
              ? 'O WABA de teste foi validado, mas o app ainda não conseguiu assinar seus webhooks.'
              : 'Não foi possível concluir o vínculo do número de teste.',
      stage,
    }, { status: 502 });
  }
});
