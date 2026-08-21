import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead, assertCanAccessLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formatBRLFromCents } from '@/lib/currency-brl';
import { leadPurchaseSchema, summarizePurchases } from '@/lib/lead-purchases';
import { dispatchLeadPurchaseTracking } from '@/lib/tracking';

export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true, assignedTo: true } });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  try { assertCanAccessLead(session, lead); } catch { return NextResponse.json({ error: 'Você não tem permissão para acessar compras deste lead.' }, { status: 403 }); }
  const purchases = await prisma.leadPurchase.findMany({ where: { tenantId: session.tenantId, leadId: lead.id }, orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }] });
  return NextResponse.json({ purchases, summary: summarizePurchases(purchases) });
});

export const POST = withPermission('LEADS_EDIT_ASSIGNED', async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: {
      id: true,
      assignedTo: true,
      pipelineId: true,
      stageId: true,
      email: true,
      phone: true,
      name: true,
    },
  });
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) return NextResponse.json({ error: 'Sem permissão para registrar compras neste lead.' }, { status: 403 });
  const parsed = leadPurchaseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  const data = parsed.data;
  const purchase = await prisma.leadPurchase.create({ data: { tenantId: session.tenantId, leadId: lead.id, amountCents: data.amountCents, currency: 'BRL', purchaseDate: new Date(data.purchaseDate), orderNumber: data.orderNumber || null, paymentMethod: data.paymentMethod || null, notes: data.notes || null, createdBy: session.userId, updatedBy: session.userId } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id, action: 'lead.purchase_created', metadata: { purchaseId: purchase.id, amountCents: purchase.amountCents, message: `Compra de ${formatBRLFromCents(purchase.amountCents)} registrada.` } });

  // Revenue registration is the source of truth for Purchase. Tracking is
  // best-effort and must never roll back or block the commercial purchase.
  let trackingEvents: unknown[] = [];
  try {
    trackingEvents = await dispatchLeadPurchaseTracking({
      tenantId: session.tenantId,
      leadId: lead.id,
      pipelineId: lead.pipelineId,
      toStageId: lead.stageId,
      triggeredById: session.userId,
      lead: { email: lead.email, phone: lead.phone, name: lead.name },
      purchase: { id: purchase.id, amountCents: purchase.amountCents, currency: purchase.currency },
    });
  } catch (error) {
    console.error('purchase tracking failed after purchase was persisted', {
      tenantId: session.tenantId,
      leadId: lead.id,
      purchaseId: purchase.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }

  return NextResponse.json({ purchase, message: 'Compra registrada com sucesso.', trackingEvents }, { status: 201 });
});
