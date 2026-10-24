/**
 * What the AI reads of each past message of a conversation. Voice notes count too, through the
 * transcript kept with the message, so a person's audio is never invisible to the AI.
 * Pure, easy to test.
 */

export type HistoryMessage = {
  type: string;
  text: string | null;
  metadata: unknown;
  direction?: string;
  sentByUserId?: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

/** A message a person of the team sent (in FlipForm or from the phone), not the AI nor an automation. */
export function isTeamMessage(message: HistoryMessage) {
  if (message.direction !== 'outbound') return false;
  const metadata = metadataRecord(message.metadata);
  if (typeof metadata.aiAgentId === 'string') return false;
  return Boolean(message.sentByUserId) || metadata.businessAppEcho === true;
}

/** The placeholder text some audio messages carry; it says nothing. */
const AUDIO_PLACEHOLDER = '🎤 Áudio';

export function messageTranscript(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).transcript
    : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bodyOf(message: HistoryMessage) {
  if (message.type === 'audio') {
    const transcript = messageTranscript(message.metadata);
    if (transcript) return `[Áudio] ${transcript}`;
  }
  const text = message.text?.trim();
  if (!text || (message.type === 'audio' && text === AUDIO_PLACEHOLDER)) return null;
  return text;
}

/** What the AI reads; what a person of the team said is marked, so the AI never takes it as its own. */
export function historyContent(message: HistoryMessage) {
  const body = bodyOf(message);
  if (!body) return null;
  return isTeamMessage(message) ? `[Equipe] ${body}` : body;
}
