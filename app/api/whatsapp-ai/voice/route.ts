import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { elevenLabsConfigured } from '@/lib/flip-ai/elevenlabs-speech';
import { whatsappVoiceSettingsSchema } from '@/lib/whatsapp-ai/voice-rules';
import { saveWhatsAppVoiceSettings, whatsappVoiceSettings } from '@/lib/whatsapp-ai/voice';

/** "Respostas em áudio" of the WhatsApp attendant. */
export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  const settings = await whatsappVoiceSettings(session.tenantId);
  if (!settings) return NextResponse.json({ ready: false });
  return NextResponse.json({ ready: true, settings, elevenLabsReady: elevenLabsConfigured() });
});

export const PUT = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const parsed = whatsappVoiceSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Configuração inválida.' }, { status: 400 });
  if (!(await whatsappVoiceSettings(session.tenantId))) return NextResponse.json({ error: 'As respostas em áudio ainda não foram instaladas no banco.' }, { status: 409 });
  if (parsed.data.mode !== 'off' && parsed.data.provider === 'elevenlabs' && !elevenLabsConfigured()) {
    return NextResponse.json({ error: 'A chave da ElevenLabs ainda não foi configurada no servidor.' }, { status: 400 });
  }
  await saveWhatsAppVoiceSettings({ tenantId: session.tenantId, userId: session.userId, ...parsed.data });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_voice_settings', entityId: session.tenantId,
      action: 'whatsapp_voice.settings_updated', metadata: { mode: parsed.data.mode, provider: parsed.data.provider },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
