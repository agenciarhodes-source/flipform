/**
 * How much of the provider an audio operation used, in the same token units every other
 * operation is priced in. The transcription reports its own tokens; the speech endpoint reports
 * nothing, so its use is estimated from the length of the text that was spoken.
 */

export const FLIP_AI_VOICE_TRANSCRIPTION_OPERATION = 'voice_transcription';
export const FLIP_AI_VOICE_SPEECH_OPERATION = 'voice_speech';

/** Spoken Brazilian Portuguese, at the conversational pace the attendant uses. */
export const FLIP_AI_SPEECH_CHARACTERS_PER_SECOND = 14;
/** Audio the provider bills per second of speech it generates (about 1,250 tokens a minute). */
export const FLIP_AI_SPEECH_AUDIO_TOKENS_PER_SECOND = 21;
/** Audio the provider bills per second of speech it listens to (about 600 tokens a minute). */
export const FLIP_AI_TRANSCRIPTION_AUDIO_TOKENS_PER_SECOND = 10;
/** The fixed speaking-style instructions sent with every speech request. */
export const FLIP_AI_SPEECH_INSTRUCTION_TOKENS = 100;
const CHARACTERS_PER_TEXT_TOKEN = 4;

export type FlipAiAudioUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Seconds of audio, the unit shown in the usage report. */
  seconds: number;
  /** False when the provider reported the numbers itself. */
  estimated: boolean;
};

function whole(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function estimateSpeechUsage(characters: number): FlipAiAudioUsage {
  const length = whole(Math.trunc(characters));
  if (length === 0) return { inputTokens: 0, outputTokens: 0, seconds: 0, estimated: true };
  const seconds = Math.max(1, Math.ceil(length / FLIP_AI_SPEECH_CHARACTERS_PER_SECOND));
  return {
    inputTokens: Math.ceil(length / CHARACTERS_PER_TEXT_TOKEN) + FLIP_AI_SPEECH_INSTRUCTION_TOKENS,
    outputTokens: seconds * FLIP_AI_SPEECH_AUDIO_TOKENS_PER_SECOND,
    seconds,
    estimated: true,
  };
}

export function resolveTranscriptionUsage(input: {
  reported?: { inputTokens?: unknown; outputTokens?: unknown } | null;
  transcriptCharacters: number;
}): FlipAiAudioUsage {
  const length = whole(Math.trunc(input.transcriptCharacters));
  const seconds = length === 0 ? 0 : Math.max(1, Math.ceil(length / FLIP_AI_SPEECH_CHARACTERS_PER_SECOND));
  const inputTokens = whole(input.reported?.inputTokens);
  const outputTokens = whole(input.reported?.outputTokens);
  if (inputTokens > 0) return { inputTokens, outputTokens, seconds, estimated: false };
  return {
    inputTokens: seconds * FLIP_AI_TRANSCRIPTION_AUDIO_TOKENS_PER_SECOND,
    outputTokens: Math.ceil(length / CHARACTERS_PER_TEXT_TOKEN),
    seconds,
    estimated: true,
  };
}
