/**
 * Turns a voice message recorded by the visitor into text, so the attendant can answer it.
 * One provider call per audio, never retried here.
 */

export const FLIP_AI_VOICE_NOTE_TRANSCRIPTION_MODEL =
  process.env.OPENAI_FLIP_AI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe';

export class OpenAiTranscriptionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'OpenAiTranscriptionError';
  }
}

const EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
};

export async function transcribeVoiceNote(input: {
  bytes: Uint8Array;
  mimeType: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiTranscriptionError('OPENAI_API_KEY_MISSING');

  const extension = EXTENSION[input.mimeType];
  if (!extension) throw new OpenAiTranscriptionError('OPENAI_TRANSCRIPTION_UNSUPPORTED_AUDIO');

  const form = new FormData();
  // The provider reads the format from the file name, so it carries the right extension.
  form.set('file', new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), `audio.${extension}`);
  form.set('model', FLIP_AI_VOICE_NOTE_TRANSCRIPTION_MODEL);
  form.set('language', 'pt');
  form.set('response_format', 'json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 45_000);
  try {
    const response = await (input.fetchImpl || fetch)('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new OpenAiTranscriptionError(`OPENAI_TRANSCRIPTION_HTTP_${response.status}`);
    const payload = await response.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof payload?.text === 'string' ? payload.text.replace(/\s+/g, ' ').trim() : '';
    return { text, model: FLIP_AI_VOICE_NOTE_TRANSCRIPTION_MODEL };
  } catch (error) {
    if (error instanceof OpenAiTranscriptionError) throw error;
    throw new OpenAiTranscriptionError('OPENAI_TRANSCRIPTION_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}
