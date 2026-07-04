import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formatBRLFromCents } from '@/lib/currency-brl';
import { leadPurchaseSchema } from '@/lib/lead-purchases';

async function getLeadForEdit(id: string, tenantId: string) {
  return prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true, assignedTo: true } });
}

export const PATCH = withPermission('LEADS_EDIT_ASSIGNED', async (req, session, ctx: { params: { id: string; purchaseId: string } }) => {
  const lead = await getLeadForEdit(ctx.params.id, session.tenantId);
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para editar compras neste lead.' }, { status: 403 });
  const current = await prisma.leadPurchase.findFirst({ where: { id: ctx.params.purchaseId, leadId: lead.id, tenantId: session.tenantId } });
  if (!current) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  const parsed = leadPurchaseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  const data = parsed.data;
  const purchase = await prisma.leadPurchase.update({ where: { id: current.id }, data: { amountCents: data.amountCents, currency: 'BRL', purchaseDate: new Date(data.purchaseDate), orderNumber: data.orderNumber || null, paymentMethod: data.paymentMethod || null, notes: data.notes || null, updatedBy: session.userId } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.purchase_updated', metadata: { purchaseId: purchase.id, oldAmountCents: current.amountCents, amountCents: purchase.amountCents, message: `Compra atualizada de ${formatBRLFromCents(current.amountCents)} para ${formatBRLFromCents(purchase.amountCents)}.` } });
  return NextResponse.json({ purchase, message: 'Compra atualizada com sucesso.' });
});

export const DELETE = withPermission('LEADS_EDIT_ASSIGNED', async (_req, session, ctx: { params: { id: string; purchaseId: string } }) => {
  const lead = await getLeadForEdit(ctx.params.id, session.tenantId);
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para remover compras neste lead.' }, { status: 403 });
  const current = await prisma.leadPurchase.findFirst({ where: { id: ctx.params.purchaseId, leadId: lead.id, tenantId: session.tenantId } });
  if (!current) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  await prisma.leadPurchase.delete({ where: { id: current.id } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.purchase_deleted', metadata: { purchaseId: current.id, amountCents: current.amountCents, message: `Compra de ${formatBRLFromCents(current.amountCents)} removida.` } });
  return NextResponse.json({ ok: true, message: 'Compra removida com sucesso.' });
});
