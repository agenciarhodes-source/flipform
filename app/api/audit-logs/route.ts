import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

export const GET = withPermission('AUDIT_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: session.tenantId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return NextResponse.json({ logs });
});
