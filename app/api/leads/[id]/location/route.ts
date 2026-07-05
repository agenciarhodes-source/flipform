import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { canEditLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { leadLocationSchema } from '@/lib/schemas';
import { normalizeBrazilCity, normalizeBrazilState } from '@/lib/brazil-locations';

export const PATCH = withAuth(async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = leadLocationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Localização inválida.' }, { status: 400 });

  const state = parsed.data.state ? normalizeBrazilState(parsed.data.state) : null;
  const city = state && parsed.data.city ? normalizeBrazilCity(state, parsed.data.city) : null;
  const updated = await prisma.lead.update({ where: { id: lead.id }, data: { state, city }, select: { id: true, state: true, city: true, updatedAt: true } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.location_updated', metadata: { state, city } });
  return NextResponse.json({ ok: true, lead: updated });
});
