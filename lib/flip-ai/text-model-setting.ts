import 'server-only';

import { prisma } from '@/lib/prisma';
import { FLIP_AI_TEXT_MODEL, OpenAiResponseError, streamOpenAiText } from './openai-responses';
import { isSelectableFlipAiTextModel, type FlipAiSelectableTextModel } from './text-model-catalog';

/**
 * Platform-wide text model for customer conversations, chosen by the platform
 * admin. One model for every tenant: this is a single explicit setting, not
 * automatic selection per request.
 */

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 30_000;

export type ActiveFlipAiTextModel = {
  model: string;
  /** `admin`: chosen in the panel. `default`: environment/default fallback. */
  source: 'admin' | 'default';
};

let cached: { value: ActiveFlipAiTextModel; expiresAtMs: number } | null = null;

export function resetActiveFlipAiTextModelCache() {
  cached = null;
}

/**
 * Never throws: if the setting is missing, invalid or unreadable the
 * conversation keeps running on the default model.
 */
export async function getActiveFlipAiTextModel(nowMs = Date.now()): Promise<ActiveFlipAiTextModel> {
  if (cached && cached.expiresAtMs > nowMs) return cached.value;
  let value: ActiveFlipAiTextModel = { model: FLIP_AI_TEXT_MODEL, source: 'default' };
  try {
    const row = await prisma.platformFlipAiSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { textModel: true },
    });
    if (row && isSelectableFlipAiTextModel(row.textModel)) value = { model: row.textModel, source: 'admin' };
  } catch {
    // Table not applied yet or database unavailable: keep the default.
  }
  cached = { value, expiresAtMs: nowMs + CACHE_TTL_MS };
  return value;
}

export async function setActiveFlipAiTextModel(input: {
  model: FlipAiSelectableTextModel;
  userId: string | null;
}): Promise<ActiveFlipAiTextModel> {
  await prisma.platformFlipAiSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { textModel: input.model, updatedById: input.userId },
    create: { id: SETTINGS_ID, textModel: input.model, updatedById: input.userId },
  });
  resetActiveFlipAiTextModelCache();
  return { model: input.model, source: 'admin' };
}

/**
 * Live check before a model is activated for every tenant: one tiny request
 * with the same options a real conversation uses (streaming, strict JSON
 * schema, no storage). Platform cost only; no tenant wallet or data involved.
 */
export async function probeFlipAiTextModel(
  model: FlipAiSelectableTextModel,
): Promise<{ ok: true; answeredBy: string } | { ok: false; code: string }> {
  try {
    const result = await streamOpenAiText(
      {
        instructions: 'Responda somente com o JSON solicitado.',
        messages: [{ role: 'user', content: 'Confirme que está operacional.' }],
      },
      () => undefined,
      {
        model,
        timeoutMs: 20_000,
        textFormat: {
          type: 'json_schema',
          name: 'flip_ai_model_probe',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
        safetyIdentifier: 'flip-ai-model-probe',
        promptCacheKey: 'flip-ai-model-probe',
      },
    );
    JSON.parse(result.text);
    return { ok: true, answeredBy: result.model };
  } catch (error) {
    return { ok: false, code: error instanceof OpenAiResponseError ? error.code : 'MODEL_PROBE_FAILED' };
  }
}
