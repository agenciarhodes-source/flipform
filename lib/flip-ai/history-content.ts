/**
 * What the AI reads of each past message of a conversation. Voice notes count too, through the
 * transcript kept with the message, so a person's audio is never invisible to the AI.
 * Pure, easy to test.
 */

export type HistoryMessage = {
  type: string;
  text: string | null;
  metadata: unknown;
};

/** The placeholder text some audio messages carry; it says nothing. */
const AUDIO_PLACEHOLDER = '🎤 Áudio';

export function messageTranscript(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).transcript
    : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function historyContent(message: HistoryMessage) {
  if (message.type === 'audio') {
    const transcript = messageTranscript(message.metadata);
    if (transcript) return `[Áudio] ${transcript}`;
  }
  const text = message.text?.trim();
  if (!text || (message.type === 'audio' && text === AUDIO_PLACEHOLDER)) return null;
  return text;
}
