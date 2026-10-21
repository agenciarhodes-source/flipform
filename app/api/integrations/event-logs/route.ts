import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { googleFunnelLogRow } from '@/lib/tracking/google-funnel-log';
import { listRecentGoogleConversions } from '@/lib/tracking/google-funnel-outbox';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [trackingLogs, googleEvents] = await Promise.all([
    prisma.trackingEventLog.findMany({
      // Stubs of providers without a server transport never sent anything; they are not listed.
      where: { tenantId: session.tenantId, status: { not: 'not_dispatched' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, leadId: true, pipelineId: true, fromStageId: true, toStageId: true, provider: true, eventName: true, status: true, reason: true, triggeredById: true, eventId: true, source: true, triggerRuleId: true, conversationId: true, createdAt: true },
    }),
    // The real Google Ads deliveries (Funil Google), in the same list.
    listRecentGoogleConversions(session.tenantId, 20),
  ]);
  const logs = [...trackingLogs, ...googleEvents.map(googleFunnelLogRow)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  return NextResponse.json({ logs });
});
