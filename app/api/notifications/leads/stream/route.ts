import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STREAM_LIFETIME_MS = 50_000;
const QUERY_INTERVAL_MS = 5_000;
const encoder = new TextEncoder();

function parseCursorDate(raw: string | null) {
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseLastEventId(raw: string | null) {
  if (!raw) return null;
  const separator = raw.lastIndexOf('|');
  if (separator <= 0 || separator >= raw.length - 1) return null;
  const createdAt = parseCursorDate(raw.slice(0, separator));
  const id = raw.slice(separator + 1).trim();
  if (!createdAt || !id) return null;
  return { createdAt, id };
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
 * Server-Sent Events stream for leads already persisted by existing CRM flows.
 *
 * This route is deliberately read-only. The server performs the periodic read,
 * so background-tab timer throttling in Chrome/Edge does not delay detection.
 */
export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const headerCursor = parseLastEventId(req.headers.get('last-event-id'));
  const queryDate = parseCursorDate(searchParams.get('after'));
  const queryId = searchParams.get('afterId')?.trim() || null;

  let cursorDate = headerCursor?.createdAt || queryDate || new Date();
  let cursorId = headerCursor?.id || queryId;
  const scope = getLeadScopeForRole(session);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      controller.enqueue(encoder.encode('retry: 1500\n\n'));

      try {
        while (!req.signal.aborted && Date.now() - startedAt < STREAM_LIFETIME_MS) {
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
            take: 50,
          });

          for (const lead of leads) {
            const item = {
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
            };

            const eventId = `${lead.createdAt.toISOString()}|${lead.id}`;
            controller.enqueue(encoder.encode(
              `id: ${eventId}\nevent: lead\ndata: ${JSON.stringify(item)}\n\n`,
            ));
            cursorDate = lead.createdAt;
            cursorId = lead.id;
          }

          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          await sleep(QUERY_INTERVAL_MS, req.signal);
        }
      } catch {
        // EventSource reconnects automatically; notification failure never affects CRM.
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
});