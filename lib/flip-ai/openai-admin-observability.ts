import 'server-only';

import { z } from 'zod';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_DAYS = 30;

const amountSchema = z.object({
  value: z.number().finite(),
  currency: z.string().min(1),
});

const costResultSchema = z.object({
  amount: amountSchema.nullable().optional(),
  line_item: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  api_key_id: z.string().nullable().optional(),
}).passthrough();

const completionsResultSchema = z.object({
  input_tokens: z.number().nonnegative().default(0),
  input_cached_tokens: z.number().nonnegative().default(0),
  output_tokens: z.number().nonnegative().default(0),
  num_model_requests: z.number().nonnegative().default(0),
  model: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  api_key_id: z.string().nullable().optional(),
}).passthrough();

const embeddingsResultSchema = z.object({
  input_tokens: z.number().nonnegative().default(0),
  num_model_requests: z.number().nonnegative().default(0),
  model: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  api_key_id: z.string().nullable().optional(),
}).passthrough();

function pageSchema<T extends z.ZodTypeAny>(resultSchema: T) {
  return z.object({
    object: z.literal('page'),
    data: z.array(z.object({
      start_time: z.number().int(),
      end_time: z.number().int(),
      results: z.array(resultSchema),
    })),
    has_more: z.boolean(),
    next_page: z.string().nullable().optional(),
  });
}

const costsPageSchema = pageSchema(costResultSchema);
const completionsPageSchema = pageSchema(completionsResultSchema);
const embeddingsPageSchema = pageSchema(embeddingsResultSchema);

type FetchLike = typeof fetch;

export class OpenAiAdminObservabilityError extends Error {
  code: string;
  providerStatus: number | null;
  providerCode: string | null;
  requestId: string | null;

  constructor(
    code: string,
    message: string,
    options?: { providerStatus?: number | null; providerCode?: string | null; requestId?: string | null },
  ) {
    super(message);
    this.name = 'OpenAiAdminObservabilityError';
    this.code = code;
    this.providerStatus = options?.providerStatus ?? null;
    this.providerCode = options?.providerCode ?? null;
    this.requestId = options?.requestId ?? null;
  }
}

function appendQueryValue(search: URLSearchParams, key: string, value: string | number | string[] | undefined) {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) search.append(key, item);
    return;
  }
  search.set(key, String(value));
}

async function fetchOpenAiAdminPage<T extends z.ZodTypeAny>(input: {
  path: string;
  params: Record<string, string | number | string[] | undefined>;
  adminKey: string;
  organizationId?: string | null;
  schema: T;
  fetchImpl: FetchLike;
}): Promise<z.infer<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input.params)) appendQueryValue(search, key, value);

  const url = `${OPENAI_API_BASE_URL}${input.path}?${search.toString()}`;
  let response: Response;
  try {
    response = await input.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.adminKey}`,
        ...(input.organizationId ? { 'OpenAI-Organization': input.organizationId } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new OpenAiAdminObservabilityError(
      'OPENAI_ADMIN_NETWORK_ERROR',
      'Não foi possível consultar a observabilidade da OpenAI.',
    );
  }

  const requestId = response.headers.get('x-request-id');
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const providerCode = z.object({
      error: z.object({ code: z.string().nullable().optional() }).optional(),
    }).safeParse(body);

    throw new OpenAiAdminObservabilityError(
      'OPENAI_ADMIN_REQUEST_FAILED',
      'A OpenAI recusou a consulta administrativa de uso e custos.',
      {
        providerStatus: response.status,
        providerCode: providerCode.success ? providerCode.data.error?.code ?? null : null,
        requestId,
      },
    );
  }

  const parsed = input.schema.safeParse(body);
  if (!parsed.success) {
    throw new OpenAiAdminObservabilityError(
      'OPENAI_ADMIN_INVALID_RESPONSE',
      'A OpenAI retornou um formato inesperado para a consulta administrativa.',
      { requestId },
    );
  }
  return parsed.data;
}

export function resolveOpenAiObservabilityDays(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DAYS) {
    throw new OpenAiAdminObservabilityError(
      'OPENAI_ADMIN_INVALID_RANGE',
      'O período deve ter entre 1 e 30 dias.',
    );
  }
  return value;
}

export function parseOpenAiOperationalBalance(value: string | undefined) {
  if (!value?.trim()) return { status: 'missing' as const, usd: null };
  const normalized = value.trim().replace(',', '.');
  const usd = Number(normalized);
  if (!Number.isFinite(usd) || usd < 0 || usd > 100_000_000) {
    return { status: 'invalid' as const, usd: null };
  }
  return { status: 'valid' as const, usd: Math.round(usd * 1_000_000) / 1_000_000 };
}

function sumUsd(results: Array<z.infer<typeof costResultSchema>>) {
  return results.reduce((total, result) => {
    if (!result.amount || result.amount.currency.toLowerCase() !== 'usd') return total;
    return total + result.amount.value;
  }, 0);
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function getOpenAiAdminObservability(input: {
  adminKey: string;
  organizationId?: string | null;
  operationalBalanceRaw?: string;
  days: number;
  now?: Date;
  fetchImpl?: FetchLike;
}) {
  const days = resolveOpenAiObservabilityDays(input.days);
  const adminKey = input.adminKey.trim();
  if (!adminKey) {
    throw new OpenAiAdminObservabilityError(
      'OPENAI_ADMIN_KEY_MISSING',
      'A chave administrativa da OpenAI não foi configurada no servidor.',
    );
  }

  const now = input.now ?? new Date();
  const endTime = Math.floor(now.getTime() / 1000);
  const startTime = endTime - (days * 24 * 60 * 60);
  const fetchImpl = input.fetchImpl ?? fetch;

  const common = {
    start_time: startTime,
    end_time: endTime,
    bucket_width: '1d',
    limit: Math.min(days + 1, 31),
  };

  const [dailyCosts, groupedCosts, completions, embeddings] = await Promise.all([
    fetchOpenAiAdminPage({
      path: '/organization/costs',
      params: common,
      adminKey,
      organizationId: input.organizationId,
      schema: costsPageSchema,
      fetchImpl,
    }),
    fetchOpenAiAdminPage({
      path: '/organization/costs',
      params: {
        ...common,
        group_by: ['project_id', 'api_key_id', 'line_item'],
      },
      adminKey,
      organizationId: input.organizationId,
      schema: costsPageSchema,
      fetchImpl,
    }),
    fetchOpenAiAdminPage({
      path: '/organization/usage/completions',
      params: {
        ...common,
        group_by: ['model'],
      },
      adminKey,
      organizationId: input.organizationId,
      schema: completionsPageSchema,
      fetchImpl,
    }),
    fetchOpenAiAdminPage({
      path: '/organization/usage/embeddings',
      params: {
        ...common,
        group_by: ['model'],
      },
      adminKey,
      organizationId: input.organizationId,
      schema: embeddingsPageSchema,
      fetchImpl,
    }),
  ]);

  const daily = dailyCosts.data.map((bucket) => ({
    startTime: new Date(bucket.start_time * 1000).toISOString(),
    endTime: new Date(bucket.end_time * 1000).toISOString(),
    costUsd: roundUsd(sumUsd(bucket.results)),
  }));

  const totalCostUsd = roundUsd(daily.reduce((sum, item) => sum + item.costUsd, 0));
  const averageDailyUsd = roundUsd(totalCostUsd / days);

  const breakdownMap = new Map<string, {
    projectId: string | null;
    apiKeyId: string | null;
    lineItem: string | null;
    costUsd: number;
  }>();

  for (const bucket of groupedCosts.data) {
    for (const result of bucket.results) {
      if (!result.amount || result.amount.currency.toLowerCase() !== 'usd') continue;
      const projectId = result.project_id ?? null;
      const apiKeyId = result.api_key_id ?? null;
      const lineItem = result.line_item ?? null;
      const key = JSON.stringify([projectId, apiKeyId, lineItem]);
      const current = breakdownMap.get(key) ?? { projectId, apiKeyId, lineItem, costUsd: 0 };
      current.costUsd += result.amount.value;
      breakdownMap.set(key, current);
    }
  }

  const costBreakdown = Array.from(breakdownMap.values())
    .map((item) => ({ ...item, costUsd: roundUsd(item.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 100);

  const modelMap = new Map<string, {
    operation: 'completions' | 'embeddings';
    model: string;
    requests: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }>();

  for (const bucket of completions.data) {
    for (const result of bucket.results) {
      const model = result.model ?? 'não identificado';
      const key = `completions:${model}`;
      const current = modelMap.get(key) ?? {
        operation: 'completions' as const,
        model,
        requests: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      };
      current.requests += result.num_model_requests;
      current.inputTokens += result.input_tokens;
      current.cachedInputTokens += result.input_cached_tokens;
      current.outputTokens += result.output_tokens;
      modelMap.set(key, current);
    }
  }

  for (const bucket of embeddings.data) {
    for (const result of bucket.results) {
      const model = result.model ?? 'não identificado';
      const key = `embeddings:${model}`;
      const current = modelMap.get(key) ?? {
        operation: 'embeddings' as const,
        model,
        requests: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      };
      current.requests += result.num_model_requests;
      current.inputTokens += result.input_tokens;
      modelMap.set(key, current);
    }
  }

  const modelUsage = Array.from(modelMap.values())
    .sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));

  const operationalBalance = parseOpenAiOperationalBalance(input.operationalBalanceRaw);
  const projectedDaysRemaining = operationalBalance.status === 'valid' && averageDailyUsd > 0
    ? Math.round((operationalBalance.usd! / averageDailyUsd) * 10) / 10
    : null;

  return {
    range: {
      days,
      from: new Date(startTime * 1000).toISOString(),
      toExclusive: new Date(endTime * 1000).toISOString(),
    },
    costs: {
      totalUsd: totalCostUsd,
      averageDailyUsd,
      daily,
      breakdown: costBreakdown,
    },
    usage: {
      models: modelUsage,
      totalRequests: modelUsage.reduce((sum, item) => sum + item.requests, 0),
      totalInputTokens: modelUsage.reduce((sum, item) => sum + item.inputTokens, 0),
      totalOutputTokens: modelUsage.reduce((sum, item) => sum + item.outputTokens, 0),
    },
    operationalBalance: {
      status: operationalBalance.status,
      usd: operationalBalance.usd,
      projectedDaysRemaining,
      source: 'manual_server_configuration' as const,
    },
    provider: {
      costsEndpoint: '/v1/organization/costs',
      completionsEndpoint: '/v1/organization/usage/completions',
      embeddingsEndpoint: '/v1/organization/usage/embeddings',
      balanceEndpointAvailable: false,
    },
    generatedAt: now.toISOString(),
  };
}
