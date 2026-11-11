import { isOggOpus } from '@/lib/whatsapp-ai/voice-rules';

/**
 * Speech by ElevenLabs. The key lives only in the server environment (ELEVENLABS_API_KEY).
 * Asks for Ogg/Opus first (a WhatsApp voice note); if the account or the model does not give it,
 * falls back to MP3 (sent as an audio file).
 */

export const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2';

export class ElevenLabsSpeechError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ElevenLabsSpeechError';
  }
}

export function elevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

async function request(input: { text: string; voiceId: string; format: string; apiKey: string; fetchImpl: typeof fetch; timeoutMs: number }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${input.format}`;
  const response = await input.fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': input.apiKey, 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({
      text: input.text,
      model_id: ELEVENLABS_MODEL,
      language_code: 'pt',
      // A little variation sounds human; too much sounds unstable.
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) throw new ElevenLabsSpeechError(`ELEVENLABS_HTTP_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new ElevenLabsSpeechError('ELEVENLABS_EMPTY_AUDIO');
  return bytes;
}

export async function synthesizeElevenLabsSpeech(input: {
  text: string;
  voiceId: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const apiKey = input.apiKey || process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new ElevenLabsSpeechError('ELEVENLABS_API_KEY_MISSING');
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(input.voiceId)) throw new ElevenLabsSpeechError('ELEVENLABS_VOICE_INVALID');
  const text = input.text.trim();
  if (!text) throw new ElevenLabsSpeechError('ELEVENLABS_EMPTY_TEXT');
  const options = { text, voiceId: input.voiceId, apiKey, fetchImpl: input.fetchImpl || fetch, timeoutMs: input.timeoutMs || 40_000 };
  try {
    const opus = await request({ ...options, format: 'opus_48000_64' });
    if (isOggOpus(opus)) return { bytes: opus, mimeType: 'audio/ogg', voice: true, extension: 'ogg' };
  } catch (error) {
    // A wrong key or voice fails the same way in MP3: no second call for those.
    if (error instanceof ElevenLabsSpeechError && /HTTP_(401|403|404)$/.test(error.code)) throw error;
  }
  const mp3 = await request({ ...options, format: 'mp3_44100_128' });
  return { bytes: mp3, mimeType: 'audio/mpeg', voice: false, extension: 'mp3' };
}
