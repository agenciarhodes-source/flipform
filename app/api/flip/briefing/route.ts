import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getTodayBriefing, isBriefingEnabledForCompany, markBriefingSeen } from '@/lib/flip/briefing';

/** Today's summary of the person signed in (made on the first call of the day, from 7h). */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session) => {
  const [companyEnabled, briefing] = await Promise.all([
    isBriefingEnabledForCompany(session.tenantId),
    getTodayBriefing(session).catch(() => null),
  ]);
  return NextResponse.json({
    companyEnabled,
    canManageCompany: session.role === 'owner',
    briefing: !companyEnabled ? null : briefing ? { id: briefing.id, day: briefing.day, text: briefing.text, seenAt: briefing.seenAt?.toISOString() || null } : null,
  });
});

const bodySchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();

export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  await markBriefingSeen(session, parsed.data.id);
  return NextResponse.json({ ok: true });
});

const settingsSchema = z.object({ companyEnabled: z.boolean() }).strict();

/** Only the owner switches the daily summary on or off for the whole company. */
export const PUT = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  if (session.role !== 'owner') {
    return NextResponse.json({ error: 'Apenas o dono da empresa pode ligar ou desligar o resumo para todos.' }, { status: 403 });
  }
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  await prisma.tenant.update({ where: { id: session.tenantId }, data: { flipBriefingEnabled: parsed.data.companyEnabled } });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'tenant', entityId: session.tenantId,
      action: parsed.data.companyEnabled ? 'flip.briefing_enabled' : 'flip.briefing_disabled',
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, companyEnabled: parsed.data.companyEnabled });
});
