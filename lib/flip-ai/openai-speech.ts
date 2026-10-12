import { prepareHumanizedSpeechText } from './conversation-style';
import { FLIP_AI_AUDIO_REPLY_MAX_CHARACTERS } from './audio-reply';

/**
 * Turns an approved reply of the attendant into speech. One provider call per request,
 * never retried here. Only text the attendant already wrote is ever spoken.
 */

export const FLIP_AI_SPEECH_MODEL = process.env.OPENAI_FLIP_AI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts';
export const FLIP_AI_SPEECH_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
] as const;
export type FlipAiSpeechVoice = typeof FLIP_AI_SPEECH_VOICES[number];
export const FLIP_AI_DEFAULT_SPEECH_VOICE: FlipAiSpeechVoice = 'marin';

export const FLIP_AI_SPEECH_STYLE = [
  'Fale em português do Brasil, com voz humana, natural, acolhedora e profissional.',
  'Use ritmo de conversa, moderado, com pequenas pausas naturais na pontuação, como quem explica algo a uma pessoa.',
  'Evite tom de locutor, leitura mecânica, voz cantada ou entusiasmo exagerado.',
  'Pronuncie valores, siglas e nomes de forma natural. Não acrescente palavras nem mude o conteúdo.',
].join(' ');

export class OpenAiSpeechError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'OpenAiSpeechError';
  }
}

export function resolveSpeechVoice(raw: string | null | undefined): FlipAiSpeechVoice {
  const voice = String(raw || '').trim().toLowerCase();
  return FLIP_AI_SPEECH_VOICES.find((candidate) => candidate === voice) || FLIP_AI_DEFAULT_SPEECH_VOICE;
}

export async function synthesizeReplySpeech(input: {
  text: string;
  voice?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiSpeechError('OPENAI_API_KEY_MISSING');
  const speechText = prepareHumanizedSpeechText(input.text).slice(0, FLIP_AI_AUDIO_REPLY_MAX_CHARACTERS);
  if (!speechText) throw new OpenAiSpeechError('OPENAI_SPEECH_EMPTY_TEXT');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 45_000);
  try {
    const response = await (input.fetchImpl || fetch)('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FLIP_AI_SPEECH_MODEL,
        voice: resolveSpeechVoice(input.voice ?? process.env.OPENAI_FLIP_AI_TTS_VOICE),
        input: speechText,
        instructions: FLIP_AI_SPEECH_STYLE,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new OpenAiSpeechError(`OPENAI_SPEECH_HTTP_${response.status}`);
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) throw new OpenAiSpeechError('OPENAI_SPEECH_EMPTY_AUDIO');
    return { audio, contentType: 'audio/mpeg', characters: speechText.length, model: FLIP_AI_SPEECH_MODEL };
  } catch (error) {
    if (error instanceof OpenAiSpeechError) throw error;
    throw new OpenAiSpeechError('OPENAI_SPEECH_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}
