import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ensureConversation } from '@/lib/conversations/core';
import { FlipAiError } from './access';
import type { PublicFlipAiRuntime } from './public-agent';
import { buildPublicChatInstructions } from './public-chat';
import {
  createOpenAiRealtimeClientSecret,
  FLIP_AI_REALTIME_MODEL,
  OpenAiRealtimeError,
  type OpenAiRealtimeClientSecret,
} from './openai-realtime';

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const WINDOW_MS = 60_000;
const SESSION_LIMIT = 4;

export const realtimeSessionRequestSchema = z.object({
  requestId: z.string().uuid(),
}).strict();

type ClientSecretCreator = (
  input: { instructions: string; safetyIdentifier: string },
) => Promise<OpenAiRealtimeClientSecret>;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function consumeRealtimeQuota(tenantId: string, conversationId: string) {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  const rows = await prisma.$queryRaw<Array<{ request_count: number }>>(Prisma.sql`
    INSERT INTO flip_ai_rate_limit_buckets
      (id, tenant_id, scope, scope_key, window_start, request_count, rejected_count,
       last_request_at, created_at, updated_at)
    VALUES (${randomUUID()}, ${tenantId}, 'realtime_session', ${conversationId},
      ${windowStart}, 1, 0, NOW(), NOW(), NOW())
    ON CONFLICT (tenant_id, scope, scope_key, window_start)
    DO UPDATE SET
      request_count = flip_ai_rate_limit_buckets.request_count + 1,
      last_request_at = NOW(),
      updated_at = NOW()
    WHERE flip_ai_rate_limit_buckets.request_count < ${SESSION_LIMIT}
    RETURNING request_count
  `);
  if (rows.length) return;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE flip_ai_rate_limit_buckets
    SET rejected_count = rejected_count + 1, last_request_at = NOW(), updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND scope = 'realtime_session'
      AND scope_key = ${conversationId}
      AND window_start = ${windowStart}
  `);
  throw new FlipAiError('REALTIME_SESSION_RATE_LIMITED', 429,
    'Aguarde um instante antes de iniciar outra sessão de voz.');
}

export async function issuePublicRealtimeSession(
  runtime: PublicFlipAiRuntime,
  sessionToken: string,
  rawInput: unknown,
  createClientSecret: ClientSecretCreator = createOpenAiRealtimeClientSecret,
) {
  const parsed = realtimeSessionRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new FlipAiError('INVALID_REALTIME_SESSION_REQUEST', 400,
      'Revise a solicitação da sessão de voz.');
  }
  if (!SESSION_TOKEN.test(sessionToken)) {
    throw new FlipAiError('INVALID_PUBLIC_CHAT_SESSION', 400, 'Sessão inválida.');
  }

  const sessionHash = digest(sessionToken);
  const externalUserId = `agent:${runtime.id}:session:${sessionHash}`;
  const ensured = await ensureConversation({
    tenantId: runtime.tenantId,
    provider: 'flip_ai',
    channel: 'web',
    externalUserId,
    metadata: { agentId: runtime.id },
  });

  const state = await prisma.flipAiConversationState.upsert({
    where: { conversationId: ensured.conversation.id },
    create: {
      tenantId: runtime.tenantId,
      agentId: runtime.id,
      conversationId: ensured.conversation.id,
      status: 'active',
    },
    update: {},
  });
  if (state.tenantId !== runtime.tenantId || state.agentId !== runtime.id) {
    throw new FlipAiError('CHAT_SESSION_BINDING_CONFLICT', 409,
      'A sessão não pertence a este atendente.');
  }

  const requestKey =
    `realtime-session:${runtime.tenantId}:${runtime.id}:${sessionHash}:${parsed.data.requestId}`;
  const existing = await prisma.flipAiUsageEvent.findUnique({ where: { requestKey } });
  if (existing) {
    if (existing.tenantId !== runtime.tenantId || existing.agentId !== runtime.id
      || existing.conversationId !== ensured.conversation.id
      || existing.operation !== 'realtime_session') {
      throw new FlipAiError('REALTIME_SESSION_REQUEST_CONFLICT', 409,
        'Esta solicitação pertence a outro contexto.');
    }
    throw new FlipAiError('REALTIME_SESSION_ALREADY_REQUESTED', 409,
      'Crie uma nova solicitação explícita para iniciar outra sessão de voz.');
  }

  await consumeRealtimeQuota(runtime.tenantId, ensured.conversation.id);

  let event;
  try {
    event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: runtime.tenantId,
        agentId: runtime.id,
        conversationId: ensured.conversation.id,
        requestKey,
        operation: 'realtime_session',
        provider: 'openai',
        model: FLIP_AI_REALTIME_MODEL,
        status: 'processing',
        metadata: {
          requestId: parsed.data.requestId,
          knowledgeIndexId: runtime.knowledgeIndexId,
          phase: 'client_secret',
          attemptStartedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new FlipAiError('REALTIME_SESSION_ALREADY_REQUESTED', 409,
        'Crie uma nova solicitação explícita para iniciar outra sessão de voz.');
    }
    throw error;
  }

  const instructions = [
    buildPublicChatInstructions(runtime, [], state.summary, Boolean(ensured.identity.leadId)),
    'Esta é uma sessão de voz do mesmo atendente e da mesma conversa do chat por texto.',
    'Não crie Lead, não dispare tracking e não alegue qualificação. Essas decisões pertencem ao backend.',
    'O backend controlará as respostas e fornecerá contexto recuperado antes de cada resposta.',
  ].join('\n');

  let result: OpenAiRealtimeClientSecret;
  try {
    result = await createClientSecret({
      instructions,
      safetyIdentifier: ensured.conversation.id,
    });
  } catch (error) {
    const realtimeError = error instanceof OpenAiRealtimeError
      ? error
      : new OpenAiRealtimeError('ambiguous', 'OPENAI_REALTIME_UNKNOWN',
        'Não foi possível confirmar a sessão Realtime.');
    await prisma.flipAiUsageEvent.updateMany({
      where: { id: event.id, tenantId: runtime.tenantId, status: 'processing' },
      data: {
        status: realtimeError.kind === 'definitive' ? 'failed' : 'ambiguous',
        metadata: {
          requestId: parsed.data.requestId,
          knowledgeIndexId: runtime.knowledgeIndexId,
          phase: 'client_secret',
          errorCode: realtimeError.code,
        },
      },
    });
    throw new FlipAiError(
      realtimeError.kind === 'definitive'
        ? 'REALTIME_SESSION_UNAVAILABLE'
        : 'REALTIME_SESSION_AMBIGUOUS',
      realtimeError.kind === 'definitive' ? 503 : 409,
      realtimeError.kind === 'definitive'
        ? 'A sessão de voz não está disponível agora.'
        : 'Não foi possível confirmar a sessão. Inicie uma nova tentativa explícita.',
    );
  }

  const confirmed = await prisma.flipAiUsageEvent.updateMany({
    where: { id: event.id, tenantId: runtime.tenantId, status: 'processing' },
    data: {
      status: 'confirmed',
      model: result.model,
      metadata: {
        requestId: parsed.data.requestId,
        knowledgeIndexId: runtime.knowledgeIndexId,
        phase: 'client_secret',
        expiresAt: result.expiresAt,
      },
    },
  });
  if (confirmed.count !== 1) {
    throw new FlipAiError('REALTIME_SESSION_AMBIGUOUS', 409,
      'Não foi possível confirmar a sessão. Inicie uma nova tentativa explícita.');
  }

  return {
    clientSecret: result.value,
    expiresAt: result.expiresAt,
    model: result.model,
  };
}
