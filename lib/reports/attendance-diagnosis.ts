import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { attendanceProductivity, periodRange, transcriptFor } from './attendance-productivity';
import { formatDuration } from './attendance-productivity-rules';
import {
  cleanDiagnosisText,
  DIAGNOSIS_FORMAT,
  DIAGNOSIS_OPERATION,
  diagnosisDays,
  parseStoredDiagnosis,
  teamNumbers,
  type StoredDiagnosis,
} from './attendance-diagnosis-rules';

const COOLDOWN_MS = 60 * 60_000;
const MAX_CONVERSATIONS_PER_PERSON = 4;
const MAX_TRANSCRIPT_CHARS = 36_000;

export class AttendanceDiagnosisError extends Error {
  constructor(readonly code: 'unavailable' | 'recent' | 'no_credits' | 'nothing_to_review' | 'failed') {
    super(code);
    this.name = 'AttendanceDiagnosisError';
  }
}

/** The last diagnosis of the company, kept with the usage record that paid for it. */
export async function latestAttendanceDiagnosis(tenantId: string): Promise<StoredDiagnosis | null> {
  const event = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: DIAGNOSIS_OPERATION },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  });
  if (!event) return null;
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as Record<string, unknown> : {};
  return parseStoredDiagnosis(event.createdAt, metadata.diagnosis);
}

/**
 * The AI reads, without customer data, recent conversations answered by people of the team on
 * WhatsApp and Instagram, plus the team's numbers, and writes one diagnosis: what works, what to
 * improve and what to adjust. Charged in Flip AI credits; at most once an hour per company.
 */
export async function generateAttendanceDiagnosis(tenantId: string, input: { days: unknown; now?: Date }) {
  const now = input.now || new Date();
  const days = diagnosisDays(input.days);
  if (!process.env.OPENAI_API_KEY?.trim()) throw new AttendanceDiagnosisError('unavailable');
  const recent = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: DIAGNOSIS_OPERATION, createdAt: { gte: new Date(now.getTime() - COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) throw new AttendanceDiagnosisError('recent');
  const wallet = await getFlipAiCreditBalanceForTenant(tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) throw new AttendanceDiagnosisError('no_credits');

  const report = await attendanceProductivity(tenantId, { days, now });
  const range = periodRange(days, now);
  const team = teamNumbers(report.rows);

  // Conversations where a person of the team (not the AI) answered, on WhatsApp and Instagram.
  const people = report.rows.filter((row) => row.messages > 0);
  const budget = Math.floor(MAX_TRANSCRIPT_CHARS / Math.max(1, people.length));
  const blocks: string[] = [];
  for (const [index, person] of people.entries()) {
    const conversations = await prisma.message.findMany({
      where: {
        tenantId, channel: { in: ['whatsapp', 'instagram'] }, direction: 'outbound',
        sentByUserId: person.userId, createdAt: { gte: range.from, lte: range.to },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      take: MAX_CONVERSATIONS_PER_PERSON,
      select: { conversationId: true },
    });
    let block = `## Pessoa ${index + 1}\nNúmeros: conversas ${person.conversations} · tempo típico de resposta ${formatDuration(person.medianResponseMs)}`
      + ` · respondidas em até 15 min ${person.within15MinPct ?? 'sem dado'}% · esperando agora ${person.waitingNow}`
      + ` · leads recebidos ${person.leadsReceived} · fechados ${person.sales} · perdidos ${person.lost}`;
    for (const conversation of conversations) {
      const transcript = await transcriptFor(tenantId, conversation.conversationId, person.userId);
      if (block.length + transcript.length > budget) break;
      block += `\n### Conversa\n${transcript}`;
    }
    blocks.push(block);
  }
  if (!blocks.length) throw new AttendanceDiagnosisError('nothing_to_review');

  const teamLine = `Equipe no período (${days} dias): ${team.attendants} pessoas · ${team.conversations} conversas · tempo típico de resposta `
    + `${formatDuration(team.typicalResponseMs)} · ${team.within15MinPct ?? 'sem dado'}% respondidas em até 15 min · `
    + `${team.waitingNow} clientes esperando resposta agora · ${team.leadsReceived} leads recebidos · ${team.sales} fechados.`;

  try {
    const model = (await getActiveFlipAiTextModel()).model;
    const result = await streamOpenAiText({
      instructions: [
        'Você é um consultor sênior de atendimento comercial. Escreva o DIAGNÓSTICO DE ATENDIMENTO da equipe para o dono da empresa.',
        'Base: os números da equipe e trechos de conversas atendidas por pessoas (WhatsApp e Instagram). Considere só as falas "ATENDENTE AVALIADO";',
        'as da IA e de outras pessoas são contexto.',
        'Avalie: acolhimento e tom; triagem (perguntas certas, uma por vez, sem presumir); clareza; rapidez; como lidam com dúvidas e objeções;',
        'se conduzem ao próximo passo (documentos, reunião, fechamento) e se retomam conversas paradas.',
        'Formato: texto corrido, 4 a 6 parágrafos separados por linha em branco, como um parecer. Sem listas, sem tópicos, sem títulos, sem asteriscos.',
        'Ordem: visão geral; o que a equipe faz bem; o que mais pesa contra o resultado; o que ajustar já, com exemplos práticos do que dizer ou fazer;',
        'e uma conclusão com a prioridade da próxima semana.',
        'Não cite nomes de clientes nem dados pessoais. Pode se referir às pessoas da equipe como "Pessoa 1", "Pessoa 2" quando precisar.',
        'Seja específico, justo e direto, em português do Brasil simples. Use os números quando ajudarem. Não invente números.',
        'title: título curto. overall: uma frase com a conclusão principal.',
      ].join('\n'),
      messages: [{ role: 'user', content: `${teamLine}\n\n${blocks.join('\n\n')}` }],
    }, () => undefined, { model, textFormat: DIAGNOSIS_FORMAT, timeoutMs: 55_000, maxOutputTokens: 2_500, safetyIdentifier: `attendance-diagnosis:${tenantId}` });

    const answer = JSON.parse(result.text) as { title?: unknown; overall?: unknown; text?: unknown };
    const text = cleanDiagnosisText(answer.text);
    if (!text) throw new Error('empty diagnosis');
    const diagnosis = {
      days,
      title: typeof answer.title === 'string' ? answer.title.slice(0, 120) : 'Diagnóstico de atendimento',
      overall: typeof answer.overall === 'string' ? answer.overall.slice(0, 400) : '',
      text,
      team,
    };
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId,
        requestKey: `attendance-diagnosis:${tenantId}:${now.toISOString()}`,
        operation: DIAGNOSIS_OPERATION, provider: 'openai', model: result.model, status: 'confirmed',
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
        metadata: { diagnosis } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId, eventId: event.id }).catch(() => undefined);
  } catch {
    throw new AttendanceDiagnosisError('failed');
  }
  return latestAttendanceDiagnosis(tenantId);
}
