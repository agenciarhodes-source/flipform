import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission, assertCanAccessLead } from '@/lib/rbac-server';
import { optOutPhone, recordContactOptOut } from '@/lib/post-sale/runner';

async function loadLead(session: { tenantId: string; userId: string; role: string }, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId: session.tenantId } });
  if (!lead) return null;
  try {
    assertCanAccessLead(session as never, lead);
  } catch {
    return null;
  }
  return lead;
}

/** Whether this lead's phone is in the "no automatic messages" list. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await loadLead(session, ctx.params.id);
  const phone = optOutPhone(lead?.phone);
  if (!lead || !phone) return NextResponse.json({ optedOut: false, hasPhone: false });
  const found = await prisma.contactOptOut.findUnique({ where: { tenantId_phone: { tenantId: session.tenantId, phone } } });
  return NextResponse.json({ optedOut: Boolean(found), source: found?.source || null, hasPhone: true });
});

const bodySchema = z.object({ optedOut: z.boolean() }).strict();

export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const lead = await loadLead(session, ctx.params.id);
  const phone = optOutPhone(lead?.phone);
  if (!lead || !phone) return NextResponse.json({ error: 'Lead sem telefone.' }, { status: 404 });
  if (parsed.data.optedOut) {
    await recordContactOptOut({ tenantId: session.tenantId, phone, source: 'team', userId: session.userId });
  } else {
    await prisma.contactOptOut.deleteMany({ where: { tenantId: session.tenantId, phone } });
  }
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id,
      action: parsed.data.optedOut ? 'lead.automatic_messages_stopped' : 'lead.automatic_messages_resumed',
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, optedOut: parsed.data.optedOut });
});
