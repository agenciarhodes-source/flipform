import 'server-only';

import { prisma } from '@/lib/prisma';
import { FLIP_REQUEST_ACTIONS, flipRequestsLeft, startOfBrasiliaDay } from './daily-limit';

/** How many Flip requests this person still has today. */
export async function flipRequestsLeftToday(session: { tenantId: string; userId: string }, now = new Date()) {
  const used = await prisma.auditLog.count({
    where: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: { in: [...FLIP_REQUEST_ACTIONS] },
      createdAt: { gte: startOfBrasiliaDay(now) },
    },
  });
  return flipRequestsLeft(used);
}
