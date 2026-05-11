import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (_req, session) => {
  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: session.tenantId },
    include: { stages: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ pipelines });
});
