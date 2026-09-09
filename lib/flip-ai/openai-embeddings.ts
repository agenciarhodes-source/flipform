import 'server-only';
import { z } from 'zod';

export const FLIP_AI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const FLIP_AI_EMBEDDING_DIMENSIONS = 1536;

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) })),
  model: z.string(),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative() }),
});

export class OpenAiEmbeddingError extends Error {
  constructor(public readonly kind: 'definitive' | 'ambiguous', public readonly code: string) {
    super(code);
    this.name = 'OpenAiEmbeddingError';
  }
}

export type EmbeddingResult = { embeddings: number[][]; model: string; inputTokens: number; totalTokens: number };

export async function createOpenAiEmbeddings(inputs: string[], options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<EmbeddingResult> {
  if (!inputs.length) throw new OpenAiEmbeddingError('definitive', 'EMPTY_EMBEDDING_INPUT');
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiEmbeddingError('definitive', 'OPENAI_API_KEY_MISSING');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30_000);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: inputs, model: FLIP_AI_EMBEDDING_MODEL,
        dimensions: FLIP_AI_EMBEDDING_DIMENSIONS, encoding_format: 'float' }),
      signal: controller.signal,
    });
  } catch {
    throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_TRANSPORT_AMBIGUOUS');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new OpenAiEmbeddingError('definitive', `OPENAI_EMBEDDING_HTTP_${response.status}`);
  let json: unknown;
  try { json = await response.json(); } catch {
    throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_INVALID_JSON');
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || parsed.data.data.length !== inputs.length) {
    throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_INVALID_RESPONSE');
  }
  const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
  if (ordered.some((item, index) => item.index !== index || item.embedding.length !== FLIP_AI_EMBEDDING_DIMENSIONS)) {
    throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_DIMENSION_MISMATCH');
  }
  return { embeddings: ordered.map((item) => item.embedding), model: parsed.data.model,
    inputTokens: parsed.data.usage.prompt_tokens, totalTokens: parsed.data.usage.total_tokens };
}
