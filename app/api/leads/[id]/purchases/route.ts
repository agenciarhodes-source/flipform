import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formatBRLFromCents } from '@/lib/currency-brl';
import { leadPurchaseSchema, summarizePurchases } from '@/lib/lead-purchases';

export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  const purchases = await prisma.leadPurchase.findMany({ where: { tenantId: session.tenantId, leadId: lead.id }, orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }] });
  return NextResponse.json({ purchases, summary: summarizePurchases(purchases) });
});

export const POST = withPermission('LEADS_EDIT_ASSIGNED', async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true, assignedTo: true } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para registrar compras neste lead.' }, { status: 403 });
  const parsed = leadPurchaseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  const data = parsed.data;
  const purchase = await prisma.leadPurchase.create({ data: { tenantId: session.tenantId, leadId: lead.id, amountCents: data.amountCents, currency: 'BRL', purchaseDate: new Date(data.purchaseDate), orderNumber: data.orderNumber || null, paymentMethod: data.paymentMethod || null, notes: data.notes || null, createdBy: session.userId, updatedBy: session.userId } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.purchase_created', metadata: { purchaseId: purchase.id, amountCents: purchase.amountCents, message: `Compra de ${formatBRLFromCents(purchase.amountCents)} registrada.` } });
  return NextResponse.json({ purchase, message: 'Compra registrada com sucesso.' }, { status: 201 });
});
