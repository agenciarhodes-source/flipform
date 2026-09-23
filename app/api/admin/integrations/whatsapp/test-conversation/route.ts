import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { ensureConversation } from '@/lib/conversations/core';

const bodySchema = z.object({
  tenantId: z.string().trim().uuid(),
  recipientPhone: z.string().trim().min(8).max(20).regex(/^\d+$/),
  displayName: z.string().trim().min(2).max(80).default('Meta Review Test'),
  confirmTestRecipient: z.literal(true),
}).strict();

export const POST = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `admin-whatsapp-meta-review-conversation:${session.userId}:${getClientIp(req)}`,
    limit: 12,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas de criação de conversa de teste. Tente novamente em instantes.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos para criar a conversa de teste.' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });

  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId: tenant.id, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true, phoneNumberId: true, displayPhoneNumber: true, verifiedName: true },
  });
  if (!connection) {
    return NextResponse.json({ error: 'Vincule primeiro o número oficial de teste da Meta a este tenant.' }, { status: 409 });
  }

  const smokeBinding = await prisma.auditLog.findFirst({
    where: {
      tenantId: tenant.id,
      entityType: 'tenant_whatsapp_connection',
      entityId: connection.id,
      action: 'WHATSAPP_META_TEST_NUMBER_BOUND',
    },
    select: { id: true },
  });
  if (!smokeBinding) {
    return NextResponse.json({ error: 'A conexão ativa não foi marcada como número oficial de teste da Meta.' }, { status: 409 });
  }

  const prepared = await ensureConversation({
    tenantId: tenant.id,
    provider: 'meta',
    channel: 'whatsapp',
    externalUserId: parsed.data.recipientPhone,
    phone: parsed.data.recipientPhone,
    displayName: parsed.data.displayName,
    metadata: {
      source: 'meta_app_review_outbound_test',
      connectionId: connection.id,
      preparedByPlatformAdmin: true,
    } as Prisma.InputJsonValue,
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: session.userId,
      entityType: 'conversation',
      entityId: prepared.conversation.id,
      action: 'WHATSAPP_META_REVIEW_TEST_CONVERSATION_PREPARED',
      metadata: {
        source: 'platform_admin_meta_review',
        connectionId: connection.id,
        phoneNumberId: connection.phoneNumberId,
        recipientLast4: parsed.data.recipientPhone.slice(-4),
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    tenant,
    conversation: {
      id: prepared.conversation.id,
      displayName: prepared.identity.displayName,
      phone: prepared.identity.phone,
    },
    connection: {
      displayPhoneNumber: connection.displayPhoneNumber,
      verifiedName: connection.verifiedName,
    },
    inboxUrl: `/inbox?conversationId=${encodeURIComponent(prepared.conversation.id)}`,
    note: 'A conversa foi preparada sem simular mensagem recebida. Use o Inbox do tenant para enviar uma mensagem real ao destinatário autorizado na Meta.',
  });
});
