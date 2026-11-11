import { z } from 'zod';

/**
 * WhatsApp answers in voice (a voice note) instead of text. Global for every company, off by
 * default. "test" answers in voice only the test numbers, so the company can listen before
 * turning it on for customers. Pure rules, easy to test.
 */

export const WHATSAPP_VOICE_MODES = ['off', 'test', 'on_request', 'auto'] as const;
export type WhatsAppVoiceMode = (typeof WHATSAPP_VOICE_MODES)[number];
export const WHATSAPP_VOICE_PROVIDERS = ['elevenlabs', 'openai'] as const;
export type WhatsAppVoiceProvider = (typeof WHATSAPP_VOICE_PROVIDERS)[number];

/** Longer than this is better read than heard (and costs more): it goes as text. */
export const WHATSAPP_VOICE_MAX_CHARACTERS = 900;
/** In "auto", explanations longer than two bubbles go as voice. */
export const WHATSAPP_VOICE_AUTO_MIN_CHARACTERS = 420;

export const whatsappVoiceSettingsSchema = z.object({
  mode: z.enum(WHATSAPP_VOICE_MODES),
  provider: z.enum(WHATSAPP_VOICE_PROVIDERS),
  voiceId: z.string().trim().max(80).regex(/^[A-Za-z0-9_-]*$/, 'O ID da voz tem só letras, números, - e _.'),
}).refine((value) => value.mode === 'off' || value.provider !== 'elevenlabs' || value.voiceId.length >= 10, {
  message: 'Cole o ID da voz da ElevenLabs.',
  path: ['voiceId'],
});

export function shouldSendVoice(input: {
  mode: WhatsAppVoiceMode;
  testNumber: boolean;
  prefersAudio: boolean;
  reply: string;
}) {
  const length = input.reply.trim().length;
  if (!length || length > WHATSAPP_VOICE_MAX_CHARACTERS) return false;
  // Links, e-mails and long numbers must be read, not heard.
  if (/https?:\/\/|www\.|@\w+\.\w|\d{5,}/i.test(input.reply)) return false;
  if (input.mode === 'test') return input.testNumber;
  if (input.mode === 'on_request') return input.prefersAudio;
  if (input.mode === 'auto') return input.prefersAudio || length > WHATSAPP_VOICE_AUTO_MIN_CHARACTERS;
  return false;
}

/** The text that is spoken: no WhatsApp marks, no emoji, short pauses on line breaks. */
export function speechTextFromReply(reply: string) {
  return reply
    .replace(/[*_~`]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/([^.!?…\s])[ \t]*\n+\s*/g, '$1. ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A voice note in the Ogg/Opus format WhatsApp shows as a recorded voice message. */
export function isOggOpus(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
}
