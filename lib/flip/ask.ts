import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { computeFlipAlerts } from './alerts';
import { ASK_PLAN_FORMAT, askPlanSchema, matchName, percent, resolvePeriod, type AskPlan } from './ask-rules';

type Session = { tenantId: string; userId: string; role: string };

export class AskFlipError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function charge(session: Session, result: { model: string; inputTokens: number; outputTokens: number; responseId: string }) {
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: session.tenantId,
        requestKey: `flip-ask:${result.responseId}`,
        operation: 'flip_ask',
        provider: 'openai',
        model: result.model,
        status: 'confirmed',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        units: 1,
        metadata: { channel: 'flip' } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId: session.tenantId, eventId: event.id });
  } catch {
    // Charging never blocks the answer.
  }
}

async function interpret(session: Session, question: string, context: { attendants: string[]; stages: string[]; today: string }) {
  const model = (await getActiveFlipAiTextModel()).model;
  const result = await streamOpenAiText({
    instructions: [
      'Converta a pergunta sobre os dados de vendas de uma empresa numa das consultas prontas.',
      'leads_count: quantos leads entraram. closed: fechamentos (leads ganhos) e taxa de conversão. sources: de onde vieram os leads (origem e campanhas).',
      'by_attendant: desempenho por atendente. sales: vendas registradas (valor). whatsapp_ai: o que a IA fez no WhatsApp.',
      'pending: pendências de agora (sem resposta, tarefas atrasadas, parados). by_stage: quantos leads abertos em cada etapa.',
      'unsupported: quando a pergunta não cabe em nenhuma dessas.',
      `Hoje é ${context.today} (horário de Brasília). Sem período na pergunta, use this_month. Para datas específicas, use custom com from/to.`,
      `Atendentes: ${context.attendants.join(', ') || 'nenhum'}. Etapas: ${context.stages.join(', ') || 'nenhuma'}.`,
      'Preencha campaign, source, attendant e stage só quando a pergunta citar; senão null.',
    ].join('\n'),
    messages: [{ role: 'user', content: question }],
  }, () => undefined, { model, textFormat: ASK_PLAN_FORMAT, timeoutMs: 15_000, maxOutputTokens: 200, safetyIdentifier: session.userId });
  await charge(session, result);
  const parsed = askPlanSchema.safeParse(JSON.parse(result.text));
  if (!parsed.success) throw new AskFlipError(422, 'Não entendi a pergunta. Tente de outro jeito.');
  return parsed.data;
}

/** Runs the chosen ready-made query, with the permissions of who asked. */
export async function runAskQuery(session: Session, plan: AskPlan, now = new Date()) {
  const seesTeam = can(session.role, 'LEADS_VIEW_ALL');
  const period = resolvePeriod(plan, now);
  const [members, stages] = await Promise.all([
    prisma.tenantUser.findMany({ where: { tenantId: session.tenantId, status: 'active' }, select: { userId: true, role: true, user: { select: { name: true } } } }),
    prisma.pipelineStage.findMany({ where: { isArchived: false, pipeline: { tenantId: session.tenantId, isArchived: false } }, select: { id: true, name: true } }),
  ]);
  const attendant = seesTeam ? matchName(plan.attendant, members.map((member) => ({ id: member.userId, name: member.user.name }))) : null;
  const stage = matchName(plan.stage, stages);
  const owner = seesTeam ? (attendant ? { assignedTo: attendant.id } : {}) : { assignedTo: session.userId };
  const leadFilters: Prisma.LeadWhereInput = {
    tenantId: session.tenantId,
    ...owner,
    ...(plan.source ? { source: { contains: plan.source, mode: 'insensitive' } } : {}),
    ...(plan.campaign ? { attribution: { is: { utmCampaign: { contains: plan.campaign, mode: 'insensitive' } } } } : {}),
  };
  const filtersUsed = {
    period: period.label,
    ...(attendant ? { atendente: attendant.name } : {}),
    ...(stage ? { etapa: stage.name } : {}),
    ...(plan.source ? { origem: plan.source } : {}),
    ...(plan.campaign ? { campanha: plan.campaign } : {}),
    escopo: seesTeam ? 'equipe' : 'seus leads',
  };
  const created = { ...leadFilters, createdAt: { gte: period.start, lt: period.end } };

  const closedLeads = async (where: Prisma.LeadWhereInput) => {
    const rows = await prisma.leadStageHistory.findMany({
      where: { createdAt: { gte: period.start, lt: period.end }, lead: { ...where, status: 'won' } },
      select: { leadId: true, toStageId: true, lead: { select: { stageId: true, assignedTo: true } } },
    });
    const won = rows.filter((row) => row.toStageId === row.lead.stageId);
    return { total: new Set(won.map((row) => row.leadId)).size, rows: won };
  };

  switch (plan.query) {
    case 'leads_count': {
      const total = await prisma.lead.count({ where: { ...created, ...(stage ? { stageId: stage.id } : {}) } });
      return { filters: filtersUsed, data: { leads: total } };
    }
    case 'closed': {
      const [entered, closed] = await Promise.all([prisma.lead.count({ where: created }), closedLeads(leadFilters)]);
      return { filters: filtersUsed, data: { fechados: closed.total, leadsQueEntraram: entered, taxaDeConversao: percent(closed.total, entered) } };
    }
    case 'sources': {
      const [bySource, byCampaign, total] = await Promise.all([
        prisma.lead.groupBy({ by: ['source'], where: created, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 8 }),
        prisma.leadAttribution.groupBy({
          by: ['utmCampaign'], where: { tenantId: session.tenantId, utmCampaign: { not: null }, lead: created },
          _count: { _all: true }, orderBy: { _count: { utmCampaign: 'desc' } }, take: 8,
        }),
        prisma.lead.count({ where: created }),
      ]);
      return {
        filters: filtersUsed,
        data: {
          totalDeLeads: total,
          porOrigem: bySource.map((row) => ({ origem: row.source, leads: row._count._all, parte: percent(row._count._all, total) })),
          porCampanha: byCampaign.map((row) => ({ campanha: row.utmCampaign, leads: row._count._all })),
        },
      };
    }
    case 'by_attendant': {
      const agents = members.filter((member) => member.role === 'agent' && (seesTeam || member.userId === session.userId));
      const [entered, closed] = await Promise.all([
        prisma.lead.groupBy({ by: ['assignedTo'], where: { ...created, assignedTo: { in: agents.map((agent) => agent.userId) } }, _count: { _all: true } }),
        closedLeads({ tenantId: session.tenantId, ...(seesTeam ? {} : { assignedTo: session.userId }) }),
      ]);
      const enteredBy = new Map(entered.map((row) => [row.assignedTo, row._count._all]));
      return {
        filters: filtersUsed,
        data: agents.map((agent) => {
          const won = new Set(closed.rows.filter((row) => row.lead.assignedTo === agent.userId).map((row) => row.leadId)).size;
          const leads = enteredBy.get(agent.userId) || 0;
          return { atendente: agent.user.name, leadsQueEntraram: leads, fechados: won, taxa: percent(won, leads) };
        }).sort((a, b) => b.fechados - a.fechados),
      };
    }
    case 'sales': {
      const rows = await prisma.leadPurchase.groupBy({
        by: ['currency'],
        where: { tenantId: session.tenantId, purchaseDate: { gte: period.start, lt: period.end }, lead: { ...owner } },
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      return { filters: filtersUsed, data: rows.map((row) => ({ moeda: row.currency, valor: ((row._sum.amountCents || 0) / 100).toFixed(2), vendas: row._count._all })) };
    }
    case 'whatsapp_ai': {
      if (!seesTeam) return { filters: filtersUsed, data: { aviso: 'Esses números são da empresa toda; só gestores podem ver.' } };
      const [qualified, conversations] = await Promise.all([
        prisma.auditLog.count({ where: { tenantId: session.tenantId, action: 'lead.whatsapp_ai_created', createdAt: { gte: period.start, lt: period.end } } }),
        prisma.flipAiUsageEvent.findMany({
          where: { tenantId: session.tenantId, operation: 'chat_response', createdAt: { gte: period.start, lt: period.end }, conversation: { channel: 'whatsapp' } },
          select: { conversationId: true }, distinct: ['conversationId'],
        }),
      ]);
      return { filters: filtersUsed, data: { conversasAtendidasPelaIa: conversations.length, leadsQualificadosPelaIa: qualified } };
    }
    case 'pending': {
      const board = await computeFlipAlerts(session, now);
      const count = (kind: string) => board.alerts.filter((alert) => alert.kind === kind).length;
      return {
        filters: { ...filtersUsed, period: 'agora' },
        data: {
          conversasSemResposta: count('unanswered_conversation'),
          retornosAtrasados: count('overdue_task'),
          leadsQuentesSemTarefa: count('hot_lead_without_task'),
          leadsNovosSemContato: count('new_lead_without_contact'),
          leadsParados: count('stale_lead'),
          sugestoesDeEtapa: count('stage_suggestion'),
        },
      };
    }
    case 'by_stage': {
      const rows = await prisma.lead.groupBy({ by: ['stageId'], where: { ...leadFilters, status: 'open' }, _count: { _all: true } });
      const nameOf = new Map(stages.map((item) => [item.id, item.name]));
      return {
        filters: { ...filtersUsed, period: 'agora' },
        data: rows.map((row) => ({ etapa: nameOf.get(row.stageId) || 'Etapa arquivada', leadsAbertos: row._count._all })).sort((a, b) => b.leadsAbertos - a.leadsAbertos),
      };
    }
    default:
      return { filters: filtersUsed, data: null };
  }
}

/**
 * "Pergunte ao Flip": the AI turns the question into a ready-made query, the system runs it with the
 * permissions of who asked, and the AI writes the answer only from that result.
 */
export async function askFlip(session: Session, question: string, now = new Date()) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new AskFlipError(503, 'O Flip está indisponível no momento.');
  const wallet = await getFlipAiCreditBalanceForTenant(session.tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) throw new AskFlipError(402, 'Sem créditos de IA. Adicione créditos para perguntar ao Flip.');

  const [members, stages] = await Promise.all([
    prisma.tenantUser.findMany({ where: { tenantId: session.tenantId, status: 'active', role: 'agent' }, select: { user: { select: { name: true } } } }),
    prisma.pipelineStage.findMany({ where: { isArchived: false, pipeline: { tenantId: session.tenantId, isArchived: false } }, select: { name: true } }),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const plan = await interpret(session, question, {
    attendants: can(session.role, 'LEADS_VIEW_ALL') ? members.map((member) => member.user.name) : [],
    stages: [...new Set(stages.map((item) => item.name))],
    today,
  });
  if (plan.query === 'unsupported') {
    return {
      plan,
      answer: 'Ainda não sei responder isso. Posso falar de leads que entraram, fechamentos e conversão, origem e campanhas, desempenho por atendente, vendas, a IA no WhatsApp, pendências e leads por etapa.',
      filters: null,
    };
  }
  const result = await runAskQuery(session, plan, now);
  const model = (await getActiveFlipAiTextModel()).model;
  const written = await streamOpenAiText({
    instructions: [
      'Você é o Flip, gestor comercial do FlipForm. Responda à pergunta em português do Brasil, em 1 a 4 frases curtas.',
      'Use somente os números do resultado. Não invente nada. Diga o período considerado.',
      'Se o resultado estiver vazio, diga que não há dados para esse filtro.',
    ].join('\n'),
    messages: [{ role: 'user', content: `Pergunta: ${question}\nResultado: ${JSON.stringify(result)}` }],
  }, () => undefined, { model, timeoutMs: 15_000, maxOutputTokens: 300, safetyIdentifier: session.userId });
  await charge(session, written);
  return { plan, answer: written.text.trim().slice(0, 1_200), filters: result.filters };
}
