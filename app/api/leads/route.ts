import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipelineId');
  const search = searchParams.get('q')?.toLowerCase();

  const where: any = { tenantId: session.tenantId };
  if (pipelineId) where.pipelineId = pipelineId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true } }, stage: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ leads });
});
