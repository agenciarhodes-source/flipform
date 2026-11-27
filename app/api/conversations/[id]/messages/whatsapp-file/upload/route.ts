import { NextRequest, NextResponse } from 'next/server';
import { messagingPlanRequired, tenantHasMessagingPlan } from '@/lib/billing/plan-access';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { checkDirectFile, directFileTransportLimit } from '@/lib/inbox/outbound-file-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Preflight checks metadata only, no R2 upload capability. */
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  if (!(await tenantHasMessagingPlan(session.tenantId))) return messagingPlanRequired();
  const rl = await rateLimit({ key: `whatsapp-file-upload:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const conversation = await findAccessibleInboxConversation(session, ctx.params.id);
  if (!conversation || conversation.channel !== 'whatsapp') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked=checkDirectFile({name:body.name,mimeType:body.mimeType,sizeBytes:body.sizeBytes},directFileTransportLimit(process.env));
  if(!checked.ok)return NextResponse.json({error:checked.error},{status:413,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({ready:true},{headers:{'Cache-Control':'no-store'}});
});
