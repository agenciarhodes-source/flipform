import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || 100), 200);
  // Logs de plataforma têm action que começa com "platform."
  const logs = await prisma.auditLog.findMany({
    where: { action: { startsWith: 'platform.' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { tenant: { select: { id: true, name: true, slug: true } }, user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ logs });
});
