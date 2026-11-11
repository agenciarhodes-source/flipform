import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { whatsappVoiceSettingsSchema } from '@/lib/whatsapp-ai/voice-rules';
import { synthesizeWhatsAppVoice } from '@/lib/whatsapp-ai/voice';

export const maxDuration = 60;

const SAMPLE = 'Oi! Tudo bem? Recebi os seus documentos, obrigada. Agora o nosso time vai avaliar o seu caso com calma, '
  + 'e qualquer novidade eu te aviso por aqui. Se tiver alguma dúvida, pode me mandar.';

/** Listen to a voice before turning it on. */
export const POST = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const limited = await rateLimit({ key: `whatsapp-voice-sample:${session.tenantId}`, limit: 20, windowMs: 3_600_000 });
  if (!limited.allowed) return rateLimitResponse(limited);
  const parsed = whatsappVoiceSettingsSchema.safeParse({ ...(await req.json().catch(() => ({}))), mode: 'test' });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Escolha a voz.' }, { status: 400 });
  try {
    const audio = await synthesizeWhatsAppVoice(parsed.data, SAMPLE);
    return new NextResponse(Buffer.from(audio.bytes), { headers: { 'Content-Type': audio.mimeType, 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? (error as { code?: string }).code || '' : '';
    const message = /401|403/.test(code) ? 'A chave da ElevenLabs foi recusada.'
      : /404|VOICE/.test(code) ? 'Não encontrei essa voz. Confira o ID.'
        : /402|429/.test(code) ? 'A cota da conta de voz acabou ou está no limite. Tente mais tarde.'
          : 'Não foi possível gerar a amostra.';
    return NextResponse.json({ error: message, code }, { status: 400 });
  }
});
