import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { leadCpfSummary, revealLeadCpf, setLeadCpf, clearLeadCpf } from '@/lib/leads/cpf';
import { isValidCpf, CPF_SOURCE_LABEL } from '@/lib/leads/cpf-rules';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function json(body: object, status = 200) { return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
const disabled = () => json({ enabled: false, error: 'Recurso não disponível para esta empresa.' }, 403);
async function scopedLead(session: { tenantId: string; role: string; userId: string }, id: string) {
  return prisma.lead.findFirst({ where: { ...getLeadScopeForRole(session), id, tenantId: session.tenantId }, select: { id: true, assignedTo: true } });
}
export const GET = withPermission('LEADS_VIEW', async (req, session, ctx: { params: { id: string } }) => {
  if (!await tenantHasFeature(session.tenantId, 'lead_cpf')) return disabled();
  try {
    const lead = await scopedLead(session, ctx.params.id);
    if (!lead) return json({ error: 'Não encontrado.' }, 404);
    const canEdit = canEditLead(session.role, lead, session.userId);
    if (new URL(req.url).searchParams.get('reveal') === '1') {
      if (!canEdit) return json({ error: 'Sem permissão.' }, 403);
      return json({ cpf: await revealLeadCpf({ tenantId: session.tenantId, leadId: lead.id, userId: session.userId }) });
    }
    const summary = await leadCpfSummary(session.tenantId, lead.id);
    return json({ enabled: true, ...summary, canEdit, sourceLabel: summary.source ? CPF_SOURCE_LABEL[summary.source] : null });
  } catch { return json({ error: 'CPF indisponível.' }, 503); }
});
export const PUT = withPermission('LEADS_VIEW', async (req, session, ctx: { params: { id: string } }) => {
  if (!await tenantHasFeature(session.tenantId, 'lead_cpf')) return disabled();
  try {
    const lead = await scopedLead(session, ctx.params.id);
    if (!lead) return json({ error: 'Não encontrado.' }, 404);
    if (!canEditLead(session.role, lead, session.userId)) return json({ error: 'Sem permissão.' }, 403);
    const body = await req.json().catch(() => null);
    if (typeof body?.cpf !== 'string' || body.cpf.length > 20) return json({ error: 'CPF inválido.' }, 400);
    const value = body.cpf.trim();
    const identity = { tenantId: session.tenantId, leadId: lead.id, userId: session.userId };
    if (!value) {
      await clearLeadCpf(identity);
    } else {
      if (!isValidCpf(value)) return json({ error: 'CPF inválido.' }, 400);
      const result = await setLeadCpf({ ...identity, cpf: value, source: 'team' });
      if (!result.saved) return json({ error: 'CPF indisponível.' }, 503);
    }
    return json({ ok: true });
  } catch { return json({ error: 'CPF indisponível.' }, 503); }
});
