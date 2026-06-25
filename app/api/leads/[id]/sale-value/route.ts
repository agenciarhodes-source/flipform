import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { canEditLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formatBRLFromCents } from '@/lib/currency-brl';

const saleValueSchema = z.object({
  saleValueCents: z.number().int().min(0).nullable(),
});

export const PATCH = withAuth(async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = saleValueSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Valor vendido inválido.' }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true, tenantId: true, assignedTo: true, saleValueCents: true },
  });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });
  }

  const previousValueCents = lead.saleValueCents ?? null;
  const newValueCents = parsed.data.saleValueCents;
  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      saleValueCents: newValueCents,
      saleCurrency: 'BRL',
      saleValueUpdatedAt: new Date(),
      saleValueUpdatedBy: session.userId,
    },
    include: { stage: true, assignedUser: { select: { id: true, name: true, email: true } }, form: { select: { id: true, name: true } } },
  });

  await logAudit({
    tenantId: session.tenantId,
    userId: session.userId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.sale_value_updated',
    metadata: { leadId: lead.id, previousValueCents, newValueCents, currency: 'BRL', message: `Valor vendido atualizado de ${formatBRLFromCents(previousValueCents)} para ${formatBRLFromCents(newValueCents)}.` },
  });

  return NextResponse.json({ lead: updatedLead });
});
