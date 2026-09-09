export const FLIP_AI_CHUNK_TARGET_BYTES = 4_000;
export const FLIP_AI_CHUNK_MAX_BYTES = 6_000;
export const FLIP_AI_EMBED_BATCH_MAX_BYTES = 100_000;
export const FLIP_AI_EMBED_BATCH_MAX_INPUTS = 64;

export type KnowledgeChunk = {
  ordinal: number;
  heading: string | null;
  content: string;
  contentHash: string;
  byteSize: number;
  tokenEstimate: number;
};

export type KnowledgeChunkBatch = {
  ordinal: number;
  chunks: KnowledgeChunk[];
  byteSize: number;
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function splitToByteLimit(value: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (current && currentBytes + characterBytes > maxBytes) {
      parts.push(current);
      current = character;
      currentBytes = characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkMasterMarkdown(markdown: string): KnowledgeChunk[] {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: KnowledgeChunk[] = [];
  let heading: string | null = null;
  let buffer = '';

  function flush() {
    const content = buffer.trim();
    if (!content) return;
    const byteSize = utf8Bytes(content);
    chunks.push({ ordinal: chunks.length, heading, content, contentHash: hashText(content),
      byteSize, tokenEstimate: Math.ceil(byteSize / 4) });
    buffer = '';
  }

  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split('\n', 1)[0];
    const match = /^(#{1,6})\s+(.+)$/.exec(firstLine);
    if (match) {
      flush();
      heading = match[2].trim().slice(0, 240) || heading;
    }
    for (const part of splitToByteLimit(paragraph, FLIP_AI_CHUNK_MAX_BYTES)) {
      const candidate = buffer ? `${buffer}\n\n${part}` : part;
      if (buffer && utf8Bytes(candidate) > FLIP_AI_CHUNK_TARGET_BYTES) flush();
      if (utf8Bytes(part) > FLIP_AI_CHUNK_MAX_BYTES) throw new Error('CHUNK_BYTE_LIMIT');
      buffer = buffer ? `${buffer}\n\n${part}` : part;
      if (utf8Bytes(buffer) >= FLIP_AI_CHUNK_TARGET_BYTES) flush();
    }
  }
  flush();
  return chunks;
}

export function batchKnowledgeChunks(chunks: KnowledgeChunk[]): KnowledgeChunkBatch[] {
  const batches: KnowledgeChunkBatch[] = [];
  let current: KnowledgeChunk[] = [];
  let byteSize = 0;
  function flush() {
    if (!current.length) return;
    batches.push({ ordinal: batches.length, chunks: current, byteSize });
    current = []; byteSize = 0;
  }
  for (const chunk of chunks) {
    if (current.length && (current.length >= FLIP_AI_EMBED_BATCH_MAX_INPUTS ||
      byteSize + chunk.byteSize > FLIP_AI_EMBED_BATCH_MAX_BYTES)) flush();
    current.push(chunk); byteSize += chunk.byteSize;
  }
  flush();
  return batches;
}
import { createHash } from 'crypto';
