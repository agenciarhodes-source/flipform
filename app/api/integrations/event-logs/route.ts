import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const logs = await prisma.trackingEventLog.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, leadId: true, pipelineId: true, fromStageId: true, toStageId: true, provider: true, eventName: true, status: true, reason: true, triggeredById: true, eventId: true, source: true, triggerRuleId: true, conversationId: true, createdAt: true },
  });
  return NextResponse.json({ logs });
});
