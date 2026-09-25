import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WAIT_TIMEOUT_MS = 20_000;
const CHECK_INTERVAL_MS = 2_000;
const MAX_ITEMS = 50;

function parseCursorDate(raw: string | null) {
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * Long-poll endpoint for new-lead notifications.
 *
 * The request stays open on the server until a new lead exists or the timeout
 * expires. This avoids relying on browser timers while the FlipForm tab is hidden.
 * It is strictly read-only and uses the same tenant/RBAC scope as the normal feed.
 */
export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get('after');
  const afterId = searchParams.get('afterId')?.trim() || null;

  if (!afterRaw) {
    return NextResponse.json({
      items: [],
      cursor: { createdAt: new Date().toISOString(), id: null },
      readOnly: true,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const after = parseCursorDate(afterRaw);
  if (!after) {
    return NextResponse.json({ error: 'Cursor de notificações inválido.' }, { status: 400 });
  }

  let cursorDate = after;
  let cursorId = afterId;
  const scope = getLeadScopeForRole(session);
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (!req.signal.aborted && Date.now() < deadline) {
    const createdAfter = cursorId
      ? {
          OR: [
            { createdAt: { gt: cursorDate } },
            { createdAt: cursorDate, id: { gt: cursorId } },
          ],
        }
      : { createdAt: { gt: cursorDate } };

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

    if (leads.length) {
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
      const last = leads.at(-1)!;
      return NextResponse.json({
        items,
        cursor: { createdAt: last.createdAt.toISOString(), id: last.id },
        hasMore: leads.length === MAX_ITEMS,
        readOnly: true,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await sleep(CHECK_INTERVAL_MS, req.signal);
  }

  return NextResponse.json({
    items: [],
    cursor: { createdAt: cursorDate.toISOString(), id: cursorId },
    readOnly: true,
  }, { headers: { 'Cache-Control': 'no-store' } });
});