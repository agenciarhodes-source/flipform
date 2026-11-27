import { NextRequest, NextResponse } from 'next/server';
import { messagingPlanRequired, tenantHasMessagingPlan } from '@/lib/billing/plan-access';
import { withPermission } from '@/lib/rbac-server';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';
import { pauseConversationAi } from '@/lib/whatsapp-ai/pause';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { WhatsAppOutboundError } from '@/lib/meta/whatsapp-outbound';
import { WhatsAppMediaError } from '@/lib/meta/whatsapp-media';
import { OutboundFileError, sendOutboundFile } from '@/lib/inbox/outbound-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Direct authenticated binary transfer to Meta; no R2 copy. */
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  if (!(await tenantHasMessagingPlan(session.tenantId))) return messagingPlanRequired();
  const rl = await rateLimit({ key: `whatsapp-file-send:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const origin=req.headers.get('origin');
  if(origin!==null&&origin!==req.nextUrl.origin)return NextResponse.json({error:'Origem não permitida.'},{status:403});
  const conversation=await findAccessibleInboxConversation(session,ctx.params.id);
  if(!conversation||conversation.channel!=='whatsapp')return NextResponse.json({error:'Conversa não encontrada.'},{status:404});
  const idempotencyKey=req.headers.get('x-idempotency-key')||'';
  const rawSize=req.headers.get('x-file-size')||'';
  const sizeBytes=Number(rawSize);
  const declaredLength=req.headers.get('content-length');
  let name='';
  try{name=decodeURIComponent(req.headers.get('x-file-name')||'');}catch{return NextResponse.json({error:'Nome inválido.'},{status:400});}
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)||!/^\d{1,9}$/.test(rawSize)||!name||name.length>240||(declaredLength!==null&&declaredLength!==rawSize)){
    return NextResponse.json({error:'Arquivo ou chave de envio inválida.'},{status:400});
  }
  try {
    const result = await sendOutboundFile({tenantId:session.tenantId,userId:session.userId,conversationId:conversation.id,idempotencyKey,name,mimeType:req.headers.get('content-type'),sizeBytes,body:req.body});
    // A person of the team answered: the AI steps back in this conversation.
    if (result.status !== 'failed') {
      await pauseConversationAi({ tenantId: session.tenantId, conversationId: ctx.params.id, userId: session.userId, reason: 'human_reply_system' }).catch(() => undefined);
    }
    if (result.status === 'failed') {
      return NextResponse.json({ error: 'A Meta recusou o arquivo ou a conexão do WhatsApp não está disponível.', result }, { status: 502 });
    }
    if (result.status === 'delivery_unknown' || result.status === 'in_progress') {
      return NextResponse.json({ result, warning: 'O envio não será repetido automaticamente para evitar mensagem duplicada.' }, { status: 202 });
    }
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof OutboundFileError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof WhatsAppMediaError) return NextResponse.json({ error: 'Não foi possível confirmar o envio do arquivo para a Meta. Verifique a conversa antes de repetir.' }, { status: 502 });
    if (error instanceof WhatsAppOutboundError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode enviar mensagens nesta conversa.' }, { status: 403 });
      if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
      if (error.code === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'Este envio já foi feito com outro arquivo.' }, { status: 409 });
      return NextResponse.json({ error: 'Não foi possível preparar o arquivo para envio.' }, { status: 400 });
    }
    throw error;
  }
});
