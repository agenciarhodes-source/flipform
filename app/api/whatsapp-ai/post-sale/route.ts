import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { parseTemplateRef } from '@/lib/post-sale/rules';

const bodySchema = z.object({
  progressEnabled: z.boolean(),
  progressIntervalDays: z.number().int().min(7).max(365),
  progressTemplate: z.string().trim().max(200).nullable(),
  reviewEnabled: z.boolean(),
  reviewAfterDays: z.number().int().min(1).max(365),
  reviewTemplate: z.string().trim().max(200).nullable(),
}).strict();

const DEFAULTS = { progressEnabled: false, progressIntervalDays: 30, progressTemplate: null, reviewEnabled: false, reviewAfterDays: 15, reviewTemplate: null };

export const GET = withPermission('INTEGRATIONS_MANAGE', async (_req: NextRequest, session) => {
  const settings = await prisma.postSaleSettings.findUnique({ where: { tenantId: session.tenantId } });
  const [sent30d, optOuts] = await Promise.all([
    prisma.postSaleSend.count({ where: { tenantId: session.tenantId, status: 'sent', createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.contactOptOut.count({ where: { tenantId: session.tenantId } }),
  ]);
  return NextResponse.json({ settings: settings || DEFAULTS, sent30d, optOuts });
});

export const PUT = withPermission('INTEGRATIONS_MANAGE', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Configuração de pós-venda inválida.' }, { status: 400 });
  const data = parsed.data;
  for (const [enabled, template] of [[data.progressEnabled, data.progressTemplate], [data.reviewEnabled, data.reviewTemplate]] as const) {
    if (enabled && !parseTemplateRef(template)) {
      return NextResponse.json({ error: 'Escolha um modelo aprovado para cada mensagem ligada.' }, { status: 400 });
    }
  }
  const saved = await prisma.postSaleSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...data, updatedBy: session.userId },
    update: { ...data, updatedBy: session.userId },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'post_sale_settings', entityId: saved.id,
      action: 'post_sale.settings_updated',
      metadata: { progressEnabled: saved.progressEnabled, reviewEnabled: saved.reviewEnabled },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, settings: saved });
});
