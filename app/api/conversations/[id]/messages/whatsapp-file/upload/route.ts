import { NextRequest, NextResponse } from 'next/server';
import { messagingPlanRequired, tenantHasMessagingPlan } from '@/lib/billing/plan-access';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { issueOutboundFileUpload, OutboundFileError } from '@/lib/inbox/outbound-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Step 1 of sending a file from the Inbox: the link the browser uses to upload it. */
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  if (!(await tenantHasMessagingPlan(session.tenantId))) return messagingPlanRequired();
  const rl = await rateLimit({ key: `whatsapp-file-upload:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation || conversation.channel !== 'whatsapp') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const upload = await issueOutboundFileUpload({
      tenantId: session.tenantId,
      userId: session.userId,
      conversationId: conversation.id,
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return NextResponse.json(upload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof OutboundFileError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
