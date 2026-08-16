import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

export const GET = withPermission('INBOX_MANAGE', async (req: NextRequest, session) => {
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json({ leads: [] });

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: session.tenantId,
      ...(session.role === 'agent' ? { assignedTo: session.userId } : {}),
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      assignedTo: true,
      stage: { select: { name: true } },
      pipeline: { select: { name: true } },
    },
  });

  return NextResponse.json({ leads });
});
