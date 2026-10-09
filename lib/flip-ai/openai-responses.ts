import 'server-only';

import { z } from 'zod';

export const FLIP_AI_TEXT_MODEL = process.env.OPENAI_FLIP_AI_TEXT_MODEL || 'gpt-5.6-luna';
// The budget covers the whole structured turn (reply, identity, qualification, memory)
// plus any reasoning tokens the model spends; only tokens actually used are billed.
export const FLIP_AI_MAX_OUTPUT_TOKENS = 1_500;
/** Larger budget for the single recovery attempt after a truncated response. */
export const FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS = 4_000;

export type OpenAiConversationInput = {
  instructions: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type OpenAiJsonSchemaFormat = {
  type: 'json_schema';
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

export type OpenAiTextResult = {
  responseId: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export class OpenAiResponseError extends Error {
  constructor(public readonly kind: 'definitive' | 'ambiguous', public readonly code: string) {
    super(code);
    this.name = 'OpenAiResponseError';
  }
}

const completedSchema = z.object({
  type: z.literal('response.completed'),
  response: z.object({
    id: z.string().min(1),
    model: z.string().min(1),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    }),
  }),
});

function dataPayload(block: string): string | null {
  const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n');
  return data || null;
}

export async function streamOpenAiText(
  input: OpenAiConversationInput,
  onDelta: (delta: string) => void | Promise<void>,
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    model?: string;
    textFormat?: OpenAiJsonSchemaFormat;
    safetyIdentifier?: string;
    promptCacheKey?: string;
    maxOutputTokens?: number;
  } = {},
): Promise<OpenAiTextResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAiResponseError('definitive', 'OPENAI_API_KEY_MISSING');
  if (!input.messages.length) throw new OpenAiResponseError('definitive', 'OPENAI_INPUT_EMPTY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60_000);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || FLIP_AI_TEXT_MODEL,
        instructions: input.instructions,
        input: input.messages,
        max_output_tokens: options.maxOutputTokens || FLIP_AI_MAX_OUTPUT_TOKENS,
        store: false,
        stream: true,
        ...(options.textFormat ? { text: { format: options.textFormat } } : {}),
        ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier } : {}),
        ...(options.promptCacheKey ? { prompt_cache_key: options.promptCacheKey } : {}),
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_TRANSPORT_AMBIGUOUS');
  }

  if (!response.ok) {
    clearTimeout(timeout);
    throw new OpenAiResponseError('definitive', `OPENAI_RESPONSE_HTTP_${response.status}`);
  }
  if (!response.body) {
    clearTimeout(timeout);
    throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_STREAM_MISSING');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let completed: z.infer<typeof completedSchema> | null = null;
  let truncated = false;

  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      if (chunk.done && buffer.trim()) {
        blocks.push(buffer);
        buffer = '';
      }

      for (const block of blocks) {
        const payload = dataPayload(block);
        if (!payload || payload === '[DONE]') continue;
        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_EVENT_INVALID');
        }
        if (!event || typeof event !== 'object' || !('type' in event)) continue;
        const typed = event as { type: string; delta?: unknown; message?: unknown };
        if (typed.type === 'response.output_text.delta' || typed.type === 'response.refusal.delta') {
          if (typeof typed.delta !== 'string') throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_DELTA_INVALID');
          output += typed.delta;
          if (output.length > 24_000) throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_OUTPUT_TOO_LARGE');
          await onDelta(typed.delta);
        } else if (typed.type === 'response.completed') {
          const parsed = completedSchema.safeParse(event);
          if (!parsed.success) throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_COMPLETION_INVALID');
          completed = parsed.data;
        } else if (typed.type === 'response.incomplete') {
          // The model stopped before finishing (typically the output budget): the text is unusable.
          truncated = true;
        } else if (typed.type === 'response.failed' || typed.type === 'error') {
          throw new OpenAiResponseError('definitive', 'OPENAI_RESPONSE_FAILED');
        }
      }
      if (chunk.done) break;
    }
  } catch (error) {
    if (error instanceof OpenAiResponseError) throw error;
    throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_STREAM_AMBIGUOUS');
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }

  if (truncated) {
    // Definitive: the provider reported an unfinished response, so nothing was delivered.
    throw new OpenAiResponseError('definitive', 'OPENAI_RESPONSE_TRUNCATED');
  }
  if (!completed || !output.trim()) {
    throw new OpenAiResponseError('ambiguous', 'OPENAI_RESPONSE_INCOMPLETE');
  }
  return {
    responseId: completed.response.id,
    model: completed.response.model,
    text: output,
    inputTokens: completed.response.usage.input_tokens,
    outputTokens: completed.response.usage.output_tokens,
  };
}
