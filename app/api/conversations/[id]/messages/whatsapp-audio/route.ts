import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { pauseConversationAi } from '@/lib/whatsapp-ai/pause';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { enqueueAndDispatchWhatsAppAudioMessage, WhatsAppOutboundError } from '@/lib/meta/whatsapp-outbound';
import { WhatsAppMediaError } from '@/lib/meta/whatsapp-media';
import { prepareVoiceNote, VoiceNoteError } from '@/lib/audio/voice-note';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** WhatsApp accepts audio up to 16 MB; a 3-minute voice note is far below. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** A voice note recorded in the Inbox, sent to the customer on WhatsApp. */
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `whatsapp-audio-send:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  const idempotencyKey = String(form?.get('idempotencyKey') || '').trim();
  if (!file || typeof file === 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return NextResponse.json({ error: 'Áudio ou chave de envio inválida.' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'O áudio está vazio.' }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'O áudio passou do tamanho máximo (10 MB).' }, { status: 413 });

  let audio;
  try {
    audio = prepareVoiceNote(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof VoiceNoteError) {
      return NextResponse.json({ error: error.code === 'EMPTY' ? 'O áudio está vazio.' : 'Formato de áudio não suportado por este navegador.' }, { status: 415 });
    }
    throw error;
  }

  try {
    const result = await enqueueAndDispatchWhatsAppAudioMessage({
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      requestedByUserId: session.userId,
      idempotencyKey,
      audio,
    });
    // A person of the team answered: the AI steps back in this conversation.
    if (result.status !== 'failed') {
      await pauseConversationAi({ tenantId: session.tenantId, conversationId: ctx.params.id, userId: session.userId, reason: 'human_reply_system' }).catch(() => undefined);
    }
    if (result.status === 'failed') {
      return NextResponse.json({ error: 'A Meta recusou o áudio ou a conexão do WhatsApp não está disponível.', result }, { status: 502 });
    }
    if (result.status === 'delivery_unknown' || result.status === 'in_progress') {
      return NextResponse.json({ result, warning: 'O envio não será repetido automaticamente para evitar mensagem duplicada.' }, { status: 202 });
    }
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof WhatsAppMediaError) return NextResponse.json({ error: 'Não foi possível enviar o áudio para a Meta. Tente de novo.' }, { status: 502 });
    if (error instanceof WhatsAppOutboundError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode enviar mensagens nesta conversa.' }, { status: 403 });
      if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
      if (error.code === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'Este envio já foi feito com outro áudio.' }, { status: 409 });
      return NextResponse.json({ error: 'Não foi possível preparar o áudio para envio.' }, { status: 400 });
    }
    throw error;
  }
});
