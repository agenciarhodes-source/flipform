import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { canEditLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formatBRLFromCents } from '@/lib/currency-brl';

const saleValueSchema = z.object({ saleValueCents: z.number().int().positive() });

/**
 * Legacy compatibility endpoint. New commercial values are persisted as an
 * explicit LeadPurchase, never as a dashboard-only value on Lead.
 */
export const PATCH = withAuth(async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = saleValueSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Registre uma compra com valor maior que zero.' }, { status: 400 });
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true, assignedTo: true } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });

  const purchase = await prisma.leadPurchase.create({ data: {
    tenantId: session.tenantId, leadId: lead.id, amountCents: parsed.data.saleValueCents,
    currency: 'BRL', purchaseDate: new Date(), createdBy: session.userId, updatedBy: session.userId,
  } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.purchase_created', metadata: { purchaseId: purchase.id, amountCents: purchase.amountCents, source: 'legacy_sale_value_endpoint', message: `Compra de ${formatBRLFromCents(purchase.amountCents)} registrada.` } });
  return NextResponse.json({ purchase, message: 'Compra registrada com sucesso.' }, { status: 201 });
});
