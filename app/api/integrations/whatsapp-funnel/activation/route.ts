import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { serializeIntegrationSettings } from '@/lib/tracking';

const whatsappFunnelActivationSchema = z.object({
  whatsappFunnelEnabled: z.boolean(),
});

export const PATCH = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `whatsapp-funnel-activation:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = whatsappFunnelActivationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.errors[0]?.message || 'Dados inválidos para salvar ativação do Funil WhatsApp.',
      issues: parsed.error.flatten(),
    }, { status: 400 });
  }

  const settings = await prisma.tenantIntegrationSettings.upsert({
    where: { tenantId: session.tenantId },
    create: {
      tenantId: session.tenantId,
      whatsappFunnelEnabled: parsed.data.whatsappFunnelEnabled,
    },
    update: {
      whatsappFunnelEnabled: parsed.data.whatsappFunnelEnabled,
    },
  });

  await logPlatformAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'integration',
    entityId: settings.id,
    action: 'integrations.whatsapp_funnel_activation_updated',
    metadata: { whatsappFunnelEnabled: parsed.data.whatsappFunnelEnabled },
  });

  return NextResponse.json({ ok: true, settings: serializeIntegrationSettings(settings) });
});
