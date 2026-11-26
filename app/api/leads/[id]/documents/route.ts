import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { can, canEditLead } from '@/lib/rbac';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { leadDocumentsView } from '@/lib/whatsapp-ai/documents';

/** The documents the Flip AI checked for this lead, by type of case. Read only. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId, ...(can(session.role, 'LEADS_VIEW_ALL') ? {} : { assignedTo: session.userId }) },
    select: { id: true, assignedTo: true },
  });
  if (!lead) return NextResponse.json({ cases: [] });
  const view=await leadDocumentsView(session.tenantId,lead.id);
  const gojusSheet=canEditLead(session.role,lead,session.userId)&&await tenantHasFeature(session.tenantId,'gojus_sheet');
  return NextResponse.json({...view,...(gojusSheet?{gojusSheet:true}:{}),...('closing' in view?{canApproveClosingMode:session.role==='owner'}:{})},{headers:{'Cache-Control':'private, no-store'}});
});
