/**
 * Global typing pace of the public chat, for every agent of every company.
 *
 * The reply is only shown after the time a person would plausibly take to write it,
 * so a long answer does not appear instantly as if it had been pasted. The time the
 * model already spent answering counts towards it: the visitor never waits twice.
 */
export const FLIP_AI_TYPING_MS_PER_CHARACTER = 35;
export const FLIP_AI_TYPING_MIN_MS = 1_200;
export const FLIP_AI_TYPING_MAX_MS = 7_000;
/** A reply is shown as at most this many chat bubbles. */
export const FLIP_AI_REPLY_MAX_MESSAGES = 4;
/** A bubble longer than this is split at sentence boundaries, so it stays easy to read. */
export const FLIP_AI_BUBBLE_MAX_CHARACTERS = 200;

/** How long the "Escrevendo..." indicator should still stay on screen before the reply appears. */
export function resolveTypingDelayMs(replyLength: number, elapsedMs: number) {
  const length = Number.isFinite(replyLength) ? Math.max(0, replyLength) : 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const target = Math.min(
    FLIP_AI_TYPING_MAX_MS,
    Math.max(FLIP_AI_TYPING_MIN_MS, length * FLIP_AI_TYPING_MS_PER_CHARACTER),
  );
  return Math.max(0, Math.round(target - elapsed));
}

/** Sentences of a block. A dot inside a number or price (1.997) is never a boundary. */
function sentencesOf(block: string) {
  const sentences: string[] = [];
  let start = 0;
  const boundary = /[.!?…]+["”')\]]*\s+(?=[A-ZÀ-Ý0-9“"(¿¡])/g;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(block)) !== null) {
    const end = match.index + match[0].length;
    const sentence = block.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  }
  const rest = block.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

/** Packs whole sentences into bubbles of at most `max` characters; sizes follow the content. */
function packSentences(block: string, max: number) {
  if (block.length <= max) return [block];
  const bubbles: string[] = [];
  let current = '';
  for (const sentence of sentencesOf(block)) {
    if (current && current.length + 1 + sentence.length > max) {
      bubbles.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) bubbles.push(current);
  return bubbles;
}

/** A closing question gets its own bubble, so it is the last thing the person reads. */
function isolateClosingQuestion(bubbles: string[]) {
  const last = bubbles[bubbles.length - 1] ?? '';
  if (!last.endsWith('?')) return bubbles;
  const sentences = sentencesOf(last);
  const question = sentences[sentences.length - 1] ?? '';
  if (sentences.length < 2 || !question.endsWith('?')) return bubbles;
  return [...bubbles.slice(0, -1), sentences.slice(0, -1).join(' '), question];
}

/**
 * Splits a reply into the separate chat messages the agent wrote (blocks separated by a
 * blank line). A block that is too long is split at sentence boundaries and a closing
 * question is shown alone. Anything beyond the limit of bubbles is merged, never dropped.
 */
export function splitReplyIntoMessages(
  reply: string,
  maxMessages = FLIP_AI_REPLY_MAX_MESSAGES,
  maxCharacters = FLIP_AI_BUBBLE_MAX_CHARACTERS,
) {
  const blocks = reply.split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 0) return [reply.trim()];
  const size = Math.max(60, Math.trunc(maxCharacters));
  const bubbles = isolateClosingQuestion(blocks.flatMap((block) => packSentences(block, size)));
  const limit = Math.max(1, Math.trunc(maxMessages));
  if (bubbles.length <= limit) return bubbles;
  if (limit === 1) return [bubbles.join(' ')];
  // Keeps the first bubbles and the last one (usually the question); merges what is in between.
  const last = bubbles[bubbles.length - 1] ?? '';
  return [...bubbles.slice(0, limit - 2), bubbles.slice(limit - 2, -1).join(' '), last];
}
