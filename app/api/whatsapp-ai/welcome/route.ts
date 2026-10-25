import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { parseTemplateRef } from '@/lib/post-sale/rules';
import {
  WELCOME_DEFAULT_DELAY_SECONDS,
  WELCOME_MAX_DELAY_SECONDS,
  WELCOME_MIN_DELAY_SECONDS,
  welcomeDelaySeconds,
} from '@/lib/whatsapp-ai/welcome-rules';

const bodySchema = z.object({
  enabled: z.boolean(),
  template: z.string().trim().max(200).nullable(),
  delaySeconds: z.number().int().min(WELCOME_MIN_DELAY_SECONDS).max(WELCOME_MAX_DELAY_SECONDS),
}).strict();

const DEFAULTS = { enabled: false, template: null, delaySeconds: WELCOME_DEFAULT_DELAY_SECONDS };

/** "Boas-vindas no WhatsApp" for people who sent a form and did not write. */
export const GET = withPermission('INTEGRATIONS_MANAGE', async (_req: NextRequest, session) => {
  const settings = await prisma.whatsAppWelcomeSettings.findUnique({ where: { tenantId: session.tenantId } });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [sent30d, skipped30d] = await Promise.all([
    prisma.whatsAppWelcomeSend.count({ where: { tenantId: session.tenantId, status: 'sent', createdAt: { gte: since } } }),
    prisma.whatsAppWelcomeSend.count({ where: { tenantId: session.tenantId, status: 'skipped', reason: 'customer_wrote', createdAt: { gte: since } } }),
  ]);
  return NextResponse.json({
    settings: settings ? { enabled: settings.enabled, template: settings.template, delaySeconds: welcomeDelaySeconds(settings) } : DEFAULTS,
    sent30d,
    customerWrote30d: skipped30d,
  });
});

export const PUT = withPermission('INTEGRATIONS_MANAGE', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Configuração de boas-vindas inválida.' }, { status: 400 });
  const data = parsed.data;
  if (data.enabled && !parseTemplateRef(data.template)) {
    return NextResponse.json({ error: 'Escolha um modelo aprovado para ligar as boas-vindas.' }, { status: 400 });
  }
  const current = await prisma.whatsAppWelcomeSettings.findUnique({
    where: { tenantId: session.tenantId },
    select: { enabled: true, enabledAt: true },
  });
  // Switching on starts now: leads that arrived before never get the message.
  const enabledAt = data.enabled ? (current?.enabled && current.enabledAt ? current.enabledAt : new Date()) : null;
  // The minutes column stays filled (rounded up) for older code; the seconds are what counts.
  const fields = {
    enabled: data.enabled, template: data.template, delaySeconds: data.delaySeconds,
    delayMinutes: Math.max(1, Math.min(60, Math.ceil(data.delaySeconds / 60))),
  };
  const saved = await prisma.whatsAppWelcomeSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...fields, enabledAt, updatedBy: session.userId },
    update: { ...fields, enabledAt, updatedBy: session.userId },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_welcome_settings', entityId: saved.id,
      action: 'whatsapp_welcome.settings_updated',
      metadata: { enabled: saved.enabled, template: saved.template, delaySeconds: saved.delaySeconds },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, settings: { enabled: saved.enabled, template: saved.template, delaySeconds: welcomeDelaySeconds(saved) } });
});
