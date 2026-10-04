import 'server-only';

import { createHash } from 'crypto';

export const FLIP_AI_REALTIME_MODEL =
  process.env.OPENAI_FLIP_AI_REALTIME_MODEL?.trim() || 'gpt-realtime-2.1';
export const FLIP_AI_REALTIME_VOICE =
  process.env.OPENAI_FLIP_AI_REALTIME_VOICE?.trim() || 'marin';
export const FLIP_AI_REALTIME_TRANSCRIPTION_MODEL =
  process.env.OPENAI_FLIP_AI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe';

export class OpenAiRealtimeError extends Error {
  constructor(
    public kind: 'definitive' | 'ambiguous',
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type OpenAiRealtimeClientSecret = {
  value: string;
  expiresAt: number;
  model: string;
  voice: string;
  transcriptionModel: string;
};

type RealtimeOptions = {
  apiKey?: string;
  model?: string;
  voice?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

function safetyIdentifier(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function parseClientSecret(
  payload: unknown,
  expectedModel: string,
  voice: string,
  transcriptionModel: string,
  now: number,
): OpenAiRealtimeClientSecret {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OpenAiRealtimeError('ambiguous', 'OPENAI_REALTIME_INVALID_RESPONSE',
      'A OpenAI retornou uma credencial Realtime inválida.');
  }
  const raw = payload as Record<string, unknown>;
  const secret = typeof raw.value === 'string'
    ? raw.value
    : raw.client_secret && typeof raw.client_secret === 'object' && !Array.isArray(raw.client_secret)
      ? (raw.client_secret as Record<string, unknown>).value
      : null;
  const expiresAt = typeof raw.expires_at === 'number'
    ? raw.expires_at
    : raw.client_secret && typeof raw.client_secret === 'object' && !Array.isArray(raw.client_secret)
      ? (raw.client_secret as Record<string, unknown>).expires_at
      : null;
  if (typeof secret !== 'string' || secret.length < 16
    || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)
    || expiresAt * 1_000 <= now + 5_000) {
    throw new OpenAiRealtimeError('ambiguous', 'OPENAI_REALTIME_INVALID_RESPONSE',
      'A OpenAI não confirmou uma credencial Realtime utilizável.');
  }
  return { value: secret, expiresAt, model: expectedModel, voice, transcriptionModel };
}

export async function createOpenAiRealtimeClientSecret(
  input: { instructions: string; safetyIdentifier: string },
  options: RealtimeOptions = {},
): Promise<OpenAiRealtimeClientSecret> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new OpenAiRealtimeError('definitive', 'OPENAI_API_KEY_MISSING',
      'A integração OpenAI não está configurada.');
  }

  const model = options.model?.trim() || FLIP_AI_REALTIME_MODEL;
  const voice = options.voice?.trim() || FLIP_AI_REALTIME_VOICE;
  const transcriptionModel = FLIP_AI_REALTIME_TRANSCRIPTION_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  let response: Response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier(input.safetyIdentifier),
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: input.instructions,
          max_output_tokens: 1_200,
          tool_choice: 'none',
          tools: [],
          audio: {
            input: {
              noise_reduction: { type: 'near_field' },
              transcription: { model: transcriptionModel, language: 'pt' },
              turn_detection: {
                type: 'server_vad',
                create_response: false,
                interrupt_response: false,
              },
            },
            output: { voice },
          },
        },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new OpenAiRealtimeError('ambiguous', 'OPENAI_REALTIME_TRANSPORT_AMBIGUOUS',
      'Não foi possível confirmar a criação da sessão Realtime.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const kind = response.status >= 500 ? 'ambiguous' : 'definitive';
    throw new OpenAiRealtimeError(kind, 'OPENAI_REALTIME_REJECTED',
      'A OpenAI recusou a criação da sessão Realtime.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OpenAiRealtimeError('ambiguous', 'OPENAI_REALTIME_INVALID_RESPONSE',
      'A resposta da OpenAI não pôde ser confirmada.');
  }
  return parseClientSecret(payload, model, voice, transcriptionModel, (options.now ?? Date.now)());
}
