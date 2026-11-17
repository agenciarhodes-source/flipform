import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead, getLeadScopeForRole } from '@/lib/rbac-server';
import { clearLeadCpf, leadCpfSummary, revealLeadCpf, setLeadCpf } from '@/lib/leads/cpf';
import { CPF_SOURCE_LABEL, isValidCpf } from '@/lib/leads/cpf-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function leadFor(session: { tenantId: string; role: string; userId: string }, id: string) {
  return prisma.lead.findFirst({
    where: { id, tenantId: session.tenantId, ...getLeadScopeForRole(session) },
    select: { id: true, assignedTo: true },
  });
}

/**
 * The lead's CPF: masked for everyone who sees the lead; ?reveal=1 gives the full number to who may
 * edit the lead, and each view is recorded. The number is never cached by the browser.
 */
export const GET = withPermission('LEADS_VIEW', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await leadFor(session, ctx.params.id);
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const canEdit = canEditLead(session.role, lead, session.userId);
  const headers = { 'Cache-Control': 'no-store' };
  if (req.nextUrl.searchParams.get('reveal') === '1') {
    if (!canEdit) return NextResponse.json({ error: 'Sem permissão para ver o CPF completo.' }, { status: 403, headers });
    const cpf = await revealLeadCpf({ tenantId: session.tenantId, leadId: lead.id, userId: session.userId });
    return NextResponse.json({ cpf }, { headers });
  }
  const summary = await leadCpfSummary(session.tenantId, lead.id);
  return NextResponse.json({
    masked: summary?.masked || null,
    source: summary?.source || null,
    sourceLabel: summary ? CPF_SOURCE_LABEL[summary.source] || null : null,
    updatedAt: summary?.updatedAt || null,
    canEdit,
  }, { headers });
});

const bodySchema = z.object({ cpf: z.string().max(20) }).strict();

/** The team writes, corrects or clears the CPF (an empty value clears it). */
export const PUT = withPermission('LEADS_VIEW', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await leadFor(session, ctx.params.id);
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 });
  const value = parsed.data.cpf.trim();
  if (!value) {
    await clearLeadCpf({ tenantId: session.tenantId, leadId: lead.id, userId: session.userId });
    return NextResponse.json({ ok: true, masked: null });
  }
  if (!isValidCpf(value)) return NextResponse.json({ error: 'CPF inválido. Confira os 11 números.' }, { status: 400 });
  const result = await setLeadCpf({ tenantId: session.tenantId, leadId: lead.id, cpf: value, source: 'team', userId: session.userId });
  if (!result.saved && result.reason === 'not_ready') {
    return NextResponse.json({ error: 'O campo de CPF ainda não está disponível.' }, { status: 503 });
  }
  const summary = await leadCpfSummary(session.tenantId, lead.id);
  return NextResponse.json({ ok: true, masked: summary?.masked || null, sourceLabel: summary ? CPF_SOURCE_LABEL[summary.source] : null });
});
