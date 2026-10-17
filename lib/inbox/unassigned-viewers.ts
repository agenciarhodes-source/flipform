import 'server-only';

import { prisma } from '@/lib/prisma';

/** The attendants chosen in Integrações to also see the conversations nobody has yet. */
export async function getUnassignedViewerUserIds(tenantId: string): Promise<string[]> {
  try {
    const settings = await prisma.tenantWhatsAppSettings.findUnique({
      where: { tenantId },
      select: { unassignedViewerUserIds: true },
    });
    return settings?.unassignedViewerUserIds || [];
  } catch {
    // Before the column exists nobody is chosen, which is the behavior from before.
    return [];
  }
}

export async function seesUnassignedConversations(session: { tenantId: string; userId: string; role: string }) {
  if (session.role !== 'agent') return true;
  return (await getUnassignedViewerUserIds(session.tenantId)).includes(session.userId);
}
