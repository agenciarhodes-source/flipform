import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const GET = withAuth(async (_req, session) => {
  const logs = await prisma.trackingEventLog.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, leadId: true, pipelineId: true, fromStageId: true, toStageId: true, provider: true, eventName: true, status: true, triggeredById: true, createdAt: true } });
  return NextResponse.json({ logs });
});
