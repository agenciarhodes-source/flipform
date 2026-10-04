import 'server-only';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  combineDecisionConfidence,
  FLIP_AI_DECISION_ENGINE_VERSION,
  isJevEnabledForTenant,
  JEV_INTENTS,
  JEV_JOURNEY_STAGES,
  JEV_NEXT_ACTIONS,
  JEV_OBJECTIONS,
  normalizeJevOrdinalScore,
  type FlipAiConversationDecision,
} from './decision-engine';

export const FLIP_AI_JEV_DEFAULT_MODEL = 'jev-latest';
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 2_500;

type JevDecisionRun = {
  decision: FlipAiConversationDecision | null;
  status: 'disabled' | 'confirmed' | 'fallback';
  reused: boolean;
  errorCode: string | null;
};

const choiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string().min(1),
  probabilities: z.record(z.number()).optional(),
  confidence: z.number().min(0).max(1),
}).passthrough();

const scoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number().min(0),
  confidence: z.number().min(0).max(1),
}).passthrough();

const noulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
}).passthrough();

const jevResponseSchema = z.object({
  model: z.string().min(1).max(200),
  answers: z.object({
    intent: choiceAnswerSchema,
    objection: choiceAnswerSchema,
    journey_stage: choiceAnswerSchema,
    next_action: choiceAnswerSchema,
    fit: scoreAnswerSchema,
    urgency: scoreAnswerSchema,
    needs_human: noulAnswerSchema,
  }).strict(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }).strict(),
}).passthrough();

const storedDecisionSchema = z.object({
  engine: z.literal('jev'),
  engineVersion: z.string().min(1),
  model: z.string().min(1),
  intent: z.enum(JEV_INTENTS),
  objection: z.enum(JEV_OBJECTIONS),
  journeyStage: z.enum(JEV_JOURNEY_STAGES),
  nextAction: z.enum(JEV_NEXT_ACTIONS),
  fitScore: z.number().int().min(0).max(100),
  urgencyScore: z.number().int().min(0).max(100),
  needsHuman: z.boolean(),
  confidence: z.number().min(0).max(1),
  intentConfidence: z.number().min(0).max(1),
  objectionConfidence: z.number().min(0).max(1),
  stageConfidence: z.number().min(0).max(1),
}).strict();

function metadataRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : null;
}

function choiceOf<T extends readonly string[]>(
  value: string,
  allowed: T,
): T[number] | null {
  return allowed.includes(value as T[number]) ? value as T[number] : null;
}

function buildDecision(raw: z.infer<typeof jevResponseSchema>): FlipAiConversationDecision | null {
  const intent = choiceOf(raw.answers.intent.choice, JEV_INTENTS);
  const objection = choiceOf(raw.answers.objection.choice, JEV_OBJECTIONS);
  const journeyStage = choiceOf(raw.answers.journey_stage.choice, JEV_JOURNEY_STAGES);
  const nextAction = choiceOf(raw.answers.next_action.choice, JEV_NEXT_ACTIONS);
  if (!intent || !objection || !journeyStage || !nextAction) return null;

  const intentConfidence = raw.answers.intent.confidence;
  const objectionConfidence = raw.answers.objection.confidence;
  const stageConfidence = raw.answers.journey_stage.confidence;
  return {
    engine: 'jev',
    engineVersion: FLIP_AI_DECISION_ENGINE_VERSION,
    model: raw.model,
    intent,
    objection,
    journeyStage,
    nextAction,
    fitScore: normalizeJevOrdinalScore(raw.answers.fit.score),
    urgencyScore: normalizeJevOrdinalScore(raw.answers.urgency.score),
    needsHuman: raw.answers.needs_human.noul >= 0.72,
    confidence: combineDecisionConfidence([
      intentConfidence,
      objectionConfidence,
      stageConfidence,
      raw.answers.next_action.confidence,
      raw.answers.fit.confidence,
      raw.answers.urgency.confidence,
    ]),
    intentConfidence,
    objectionConfidence,
    stageConfidence,
  };
}

function payload(state: unknown, model: string) {
  return {
    model,
    state,
    questions: {
      intent: {
        type: 'choice',
        instructions: 'Qual é a intenção principal da pessoa neste ponto da conversa?',
        criteria: {
          information: 'Busca informação ou resposta para uma dúvida.',
          qualification: 'Está fornecendo ou sendo solicitada informação necessária para avaliar perfil.',
          objection: 'Apresenta resistência, receio ou motivo para não avançar.',
          scheduling: 'Quer marcar, remarcar ou discutir horário, visita ou reunião.',
          purchase: 'Demonstra intenção explícita de contratar, comprar ou avançar comercialmente.',
          support: 'Busca suporte sobre algo já contratado, comprado ou em andamento.',
          handoff: 'Pede ou claramente necessita falar com uma pessoa do time.',
          other: 'Nenhuma das categorias anteriores descreve bem a intenção atual.',
        },
      },
      objection: {
        type: 'choice',
        instructions: 'Qual objeção está mais evidente agora? Use none quando não houver objeção.',
        criteria: {
          none: 'Nenhuma objeção relevante está presente.',
          price: 'Preço, custo, orçamento, valor ou condição financeira.',
          trust: 'Dúvida sobre confiança, credibilidade, segurança ou risco.',
          timing: 'Não é o momento, quer esperar, prazo ou falta de tempo.',
          documentation: 'Falta, dúvida ou dificuldade com documentos e comprovações.',
          eligibility: 'Dúvida se atende aos critérios, requisitos ou perfil.',
          competitor: 'Comparação com concorrente, fornecedor, escritório ou alternativa.',
          uncertainty: 'Indecisão geral, precisa pensar ou ainda não entendeu o valor.',
          other: 'Há objeção, mas não se encaixa nas categorias anteriores.',
        },
      },
      journey_stage: {
        type: 'choice',
        instructions: 'Em qual estágio da jornada esta pessoa está agora?',
        criteria: {
          discovery: 'Ainda está entendendo problema, necessidade, direito, produto ou possibilidades.',
          consideration: 'Já entende a necessidade e está avaliando alternativas ou condições.',
          decision: 'Está perto de avançar, contratar, comprar, enviar documentação ou agendar.',
          post_sale: 'Já é cliente ou a solicitação acontece depois da contratação/compra.',
          unknown: 'Ainda não há evidência suficiente para definir o estágio.',
        },
      },
      next_action: {
        type: 'choice',
        instructions: 'Qual é a melhor próxima ação conversacional, sem executar mudanças no sistema?',
        criteria: {
          answer_directly: 'Responder de forma clara à dúvida atual.',
          ask_one_question: 'Fazer uma única pergunta curta que destrava a próxima decisão.',
          handle_objection: 'Responder à objeção antes de tentar avançar.',
          request_contact: 'Pedir apenas o dado de contato que ainda falta.',
          schedule: 'Avançar para intenção de agenda ou visita, sem criar compromisso automaticamente.',
          handoff: 'Recomendar atendimento humano.',
        },
      },
      fit: {
        type: 'score',
        instructions: 'Quão aderente parece o perfil desta pessoa ao que está sendo atendido, considerando somente as evidências disponíveis?',
        criteria: [
          'Sem evidência suficiente para avaliar aderência.',
          'Baixa aderência ou sinais relevantes de incompatibilidade.',
          'Aderência parcial; ainda faltam dados importantes.',
          'Boa aderência com evidências suficientes.',
          'Aderência muito forte e claramente demonstrada.',
        ],
      },
      urgency: {
        type: 'score',
        instructions: 'Qual é a urgência demonstrada pela pessoa neste momento?',
        criteria: [
          'Nenhuma urgência identificável.',
          'Baixa urgência; apenas explorando.',
          'Urgência moderada; deseja resolver, mas sem prazo imediato.',
          'Alta urgência; precisa avançar em breve.',
          'Urgência crítica ou prazo imediato explicitamente indicado.',
        ],
      },
      needs_human: {
        type: 'noul',
        instructions: 'A conversa neste momento requer atendimento humano por pedido explícito, risco, exceção, sensibilidade ou incapacidade segura de continuar automaticamente?',
      },
    },
  };
}

async function callJev(state: unknown, options?: {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const apiKey = options?.apiKey || process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new Error('TYPESAFE_API_KEY_MISSING');
  const model = options?.model || process.env.TYPESAFE_JEV_MODEL?.trim() || FLIP_AI_JEV_DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || JEV_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options?.fetchImpl || fetch)(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload(state, model)),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    throw new Error('JEV_TRANSPORT_FAILED');
  }
  clearTimeout(timeout);
  if (!response.ok) throw new Error(`JEV_HTTP_${response.status}`);
  let raw: unknown;
  try { raw = await response.json(); } catch { throw new Error('JEV_RESPONSE_INVALID'); }
  const parsed = jevResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('JEV_RESPONSE_INVALID');
  const decision = buildDecision(parsed.data);
  if (!decision) throw new Error('JEV_DECISION_INVALID');
  return {
    decision,
    model: parsed.data.model,
    inputTokens: parsed.data.usage.input_tokens,
    outputTokens: parsed.data.usage.output_tokens,
  };
}

export async function runJevConversationDecision(input: {
  tenantId: string;
  agentId: string;
  conversationId: string;
  chatRequestKey: string;
  state: unknown;
}): Promise<JevDecisionRun> {
  const enabled = isJevEnabledForTenant({
    tenantId: input.tenantId,
    enabledRaw: process.env.FLIP_AI_JEV_ENABLED,
    tenantIdsRaw: process.env.FLIP_AI_JEV_TENANT_IDS,
  });
  if (!enabled) return { decision: null, status: 'disabled', reused: false, errorCode: null };

  const requestKey = `jev-decision:${input.chatRequestKey}`;
  const existing = await prisma.flipAiUsageEvent.findUnique({
    where: { requestKey },
    select: { status: true, metadata: true },
  });
  if (existing?.status === 'confirmed') {
    const stored = metadataRecord(existing.metadata);
    const parsed = storedDecisionSchema.safeParse(stored?.decision);
    if (parsed.success) {
      return { decision: parsed.data, status: 'confirmed', reused: true, errorCode: null };
    }
    return { decision: null, status: 'fallback', reused: true, errorCode: 'JEV_STORED_DECISION_INVALID' };
  }
  if (existing) {
    return { decision: null, status: 'fallback', reused: true, errorCode: 'JEV_DECISION_ALREADY_ATTEMPTED' };
  }

  const configuredModel = process.env.TYPESAFE_JEV_MODEL?.trim() || FLIP_AI_JEV_DEFAULT_MODEL;
  let eventId: string;
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: input.tenantId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        requestKey,
        operation: 'conversation_decision',
        provider: 'typesafe',
        model: configuredModel,
        status: 'processing',
        units: 1,
        metadata: {
          chatRequestKey: input.chatRequestKey,
          decisionEngine: 'jev',
          engineVersion: FLIP_AI_DECISION_ENGINE_VERSION,
        },
      },
      select: { id: true },
    });
    eventId = event.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { decision: null, status: 'fallback', reused: true, errorCode: 'JEV_DECISION_RACE' };
    }
    return { decision: null, status: 'fallback', reused: false, errorCode: 'JEV_USAGE_EVENT_FAILED' };
  }

  try {
    const result = await callJev(input.state);
    await prisma.flipAiUsageEvent.updateMany({
      where: { id: eventId, tenantId: input.tenantId, status: 'processing' },
      data: {
        status: 'confirmed',
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        metadata: {
          chatRequestKey: input.chatRequestKey,
          decisionEngine: 'jev',
          engineVersion: FLIP_AI_DECISION_ENGINE_VERSION,
          decision: result.decision,
        },
      },
    });
    return { decision: result.decision, status: 'confirmed', reused: false, errorCode: null };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 100) : 'JEV_UNKNOWN_ERROR';
    const ambiguous = errorCode === 'JEV_TRANSPORT_FAILED'
      || errorCode === 'JEV_HTTP_429'
      || errorCode === 'JEV_HTTP_529';
    await prisma.flipAiUsageEvent.updateMany({
      where: { id: eventId, tenantId: input.tenantId, status: 'processing' },
      data: {
        status: ambiguous ? 'ambiguous' : 'failed',
        metadata: {
          chatRequestKey: input.chatRequestKey,
          decisionEngine: 'jev',
          engineVersion: FLIP_AI_DECISION_ENGINE_VERSION,
          errorCode,
        },
      },
    }).catch(() => undefined);
    return { decision: null, status: 'fallback', reused: false, errorCode };
  }
}

export const __testOnly = { callJev };
