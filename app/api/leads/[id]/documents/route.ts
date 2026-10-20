import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { can } from '@/lib/rbac';
import { leadDocumentsView } from '@/lib/whatsapp-ai/documents';

/** The documents the Flip AI checked for this lead, by type of case. Read only. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId, ...(can(session.role, 'LEADS_VIEW_ALL') ? {} : { assignedTo: session.userId }) },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ cases: [] });
  return NextResponse.json(await leadDocumentsView(session.tenantId, lead.id));
});
