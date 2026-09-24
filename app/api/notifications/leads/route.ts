import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';

const MAX_ITEMS = 50;

function parseCursorDate(raw: string | null) {
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Read-only notification feed for leads already persisted by the existing CRM flows.
 *
 * IMPORTANT:
 * - This endpoint never creates, updates, moves or deletes leads.
 * - It never touches Meta/Facebook/Pixel/CAPI/WhatsApp/Instagram connections.
 * - It does not write notification state to the database.
 * - Delivery state (seen/unseen) belongs to the browser layer and will be local-only
 *   until a future persistence design is explicitly approved.
 */
export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get('after');
  const afterId = searchParams.get('afterId')?.trim() || null;

  // First call establishes a baseline instead of replaying historical leads.
  if (!afterRaw) {
    return NextResponse.json({
      items: [],
      cursor: { createdAt: new Date().toISOString(), id: null },
      readOnly: true,
    });
  }

  const after = parseCursorDate(afterRaw);
  if (!after) {
    return NextResponse.json({ error: 'Cursor de notificações inválido.' }, { status: 400 });
  }

  const scope = getLeadScopeForRole(session);
  const createdAfter = afterId
    ? {
        OR: [
          { createdAt: { gt: after } },
          { createdAt: after, id: { gt: afterId } },
        ],
      }
    : { createdAt: { gt: after } };

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: session.tenantId,
      ...scope,
      ...createdAfter,
    },
    select: {
      id: true,
      name: true,
      source: true,
      createdAt: true,
      assignedTo: true,
      assignedUser: { select: { id: true, name: true } },
      form: { select: { id: true, name: true } },
      pipeline: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_ITEMS,
  });

  const items = leads.map((lead) => ({
    id: `lead:${lead.id}`,
    type: 'lead_created' as const,
    leadId: lead.id,
    title: lead.assignedTo === session.userId ? 'Novo lead atribuído a você' : 'Novo lead recebido',
    leadName: lead.name,
    source: lead.source,
    formName: lead.form?.name || null,
    pipelineName: lead.pipeline.name,
    stageName: lead.stage.name,
    assignedUserName: lead.assignedUser?.name || null,
    createdAt: lead.createdAt.toISOString(),
    href: `/leads?leadId=${encodeURIComponent(lead.id)}`,
  }));

  const last = leads.at(-1);
  return NextResponse.json({
    items,
    cursor: last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : { createdAt: after.toISOString(), id: afterId },
    hasMore: leads.length === MAX_ITEMS,
    readOnly: true,
  });
});
