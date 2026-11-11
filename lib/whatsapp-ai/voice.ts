import 'server-only';

import { prisma } from '@/lib/prisma';
import { synthesizeElevenLabsSpeech } from '@/lib/flip-ai/elevenlabs-speech';
import { synthesizeReplySpeech } from '@/lib/flip-ai/openai-speech';
import { enqueueAndDispatchWhatsAppAiAudioMessage } from '@/lib/meta/whatsapp-outbound';
import {
  isOggOpus,
  speechTextFromReply,
  WHATSAPP_VOICE_MODES,
  WHATSAPP_VOICE_PROVIDERS,
  type WhatsAppVoiceMode,
  type WhatsAppVoiceProvider,
} from './voice-rules';

type Row = { mode: string; provider: string; voice_id: string | null };

export type WhatsAppVoiceSettings = { mode: WhatsAppVoiceMode; provider: WhatsAppVoiceProvider; voiceId: string };

/** Voice settings of a company; null while the table does not exist yet. */
export async function whatsappVoiceSettings(tenantId: string): Promise<WhatsAppVoiceSettings | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT mode, provider, voice_id FROM whatsapp_voice_settings WHERE tenant_id = ${tenantId}`.catch(() => null);
  if (!rows) return null;
  const row = rows[0];
  return {
    mode: (WHATSAPP_VOICE_MODES as readonly string[]).includes(row?.mode || '') ? row!.mode as WhatsAppVoiceMode : 'off',
    provider: (WHATSAPP_VOICE_PROVIDERS as readonly string[]).includes(row?.provider || '') ? row!.provider as WhatsAppVoiceProvider : 'elevenlabs',
    voiceId: row?.voice_id || '',
  };
}

export async function saveWhatsAppVoiceSettings(input: { tenantId: string; userId: string } & WhatsAppVoiceSettings) {
  await prisma.$executeRaw`
    INSERT INTO whatsapp_voice_settings (tenant_id, mode, provider, voice_id, updated_by, created_at, updated_at)
    VALUES (${input.tenantId}, ${input.mode}, ${input.provider}, ${input.voiceId || null}, ${input.userId}, NOW(), NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET mode = EXCLUDED.mode, provider = EXCLUDED.provider, voice_id = EXCLUDED.voice_id,
      updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
}

/** The reply spoken by the chosen voice: Ogg/Opus voice note when possible, MP3 otherwise. */
export async function synthesizeWhatsAppVoice(settings: { provider: WhatsAppVoiceProvider; voiceId: string }, reply: string) {
  const text = speechTextFromReply(reply);
  if (settings.provider === 'elevenlabs') return synthesizeElevenLabsSpeech({ text, voiceId: settings.voiceId });
  const speech = await synthesizeReplySpeech({ text, voice: settings.voiceId || null, format: 'opus' });
  return isOggOpus(speech.audio)
    ? { bytes: speech.audio, mimeType: 'audio/ogg', voice: true, extension: 'ogg' }
    : { bytes: speech.audio, mimeType: 'audio/mpeg', voice: false, extension: 'mp3' };
}

/**
 * Sends the AI reply as a voice note. Returns null when the voice could not be made or sent,
 * so the caller sends the same reply as text: the customer is never left without an answer.
 */
export async function sendWhatsAppVoiceReply(input: {
  tenantId: string;
  conversationId: string;
  idempotencyKey: string;
  agent: { id: string; name: string };
  settings: WhatsAppVoiceSettings;
  reply: string;
}) {
  try {
    const audio = await synthesizeWhatsAppVoice(input.settings, input.reply);
    const sent = await enqueueAndDispatchWhatsAppAiAudioMessage({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      idempotencyKey: input.idempotencyKey,
      aiSender: { agentId: input.agent.id, agentName: input.agent.name },
      // What the team reads in the Inbox: the same words that were spoken.
      text: `🎤 ${input.reply}`.slice(0, 4_000),
      audio,
    });
    if (sent.status === 'failed') return null;
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: input.conversationId,
        action: 'whatsapp_ai.voice_reply_sent',
        metadata: { provider: input.settings.provider, characters: input.reply.length, voiceNote: audio.voice },
      },
    }).catch(() => undefined);
    return sent;
  } catch (error) {
    console.error('WhatsApp AI voice reply failed', { code: error instanceof Error ? (error as { code?: string }).code || error.name : 'unknown' });
    return null;
  }
}
