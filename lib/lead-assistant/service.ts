import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import {
  describeScope, findByName, joinNames, LEAD_ASSISTANT_MAX_LEADS, LEAD_ASSISTANT_PLAN_FORMAT, leadAssistantPlanSchema,
  normalizeName, planDistribution, resolvedLeadAssistantPlanSchema,
  type DistributionChange, type LeadAssistantPlan, type ResolvedLeadAssistantPlan,
} from './rules';

type Session = { tenantId: string; userId: string; role: string };

export const LEAD_ASSISTANT_BATCH_ACTION = 'lead.assistant_distributed';
export const LEAD_ASSISTANT_UNDO_ACTION = 'lead.assistant_undone';

export class LeadAssistantError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Attendant = { id: string; name: string; active: boolean; since: Date };

async function attendants(tenantId: string): Promise<Attendant[]> {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId, role: 'agent' },
    orderBy: { createdAt: 'asc' },
    select: { status: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return members.map((member) => ({ id: member.user.id, name: member.user.name, active: member.status === 'active', since: member.createdAt }));
}

async function stages(tenantId: string) {
  return prisma.pipelineStage.findMany({
    where: { isArchived: false, pipeline: { tenantId, isArchived: false } },
    select: { id: true, name: true },
  });
}

async function charge(session: Session, result: { model: string; inputTokens: number; outputTokens: number; responseId: string }) {
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: session.tenantId,
        requestKey: `lead-assistant:${result.responseId}`,
        operation: 'lead_assistant',
        provider: 'openai',
        model: result.model,
        status: 'confirmed',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        units: 1,
        metadata: { channel: 'lead_assistant' } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId: session.tenantId, eventId: event.id });
  } catch {
    // Charging never blocks the preview.
  }
}

const dateBr = (date: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);

/** The AI turns the command into a plan. It sees only the command and the names of attendants, stages, origins and tags. */
async function interpret(session: Session, command: string, context: {
  attendants: Attendant[]; stageNames: string[]; sources: string[]; tags: string[];
}) {
  const model = (await getActiveFlipAiTextModel()).model;
  const people = context.attendants.map((person) => `${person.name} (${person.active ? 'ativo' : 'inativo'}, entrou em ${dateBr(person.since)})`);
  const result = await streamOpenAiText({
    instructions: [
      'Você converte um comando de um gestor sobre a distribuição de leads (clientes em potencial) num plano. Você não executa nada.',
      'action: distribute (dividir, distribuir, passar, transferir, redistribuir ou equilibrar leads entre atendentes); report (quantos leads cada atendente tem); undo_last (desfazer a última distribuição); unsupported (qualquer outra coisa, como apagar leads, mudar etapa, mandar mensagem ou uma pergunta sobre resultados).',
      'scope: unassigned (leads sem responsável); from_attendants (leads de atendentes citados como origem, em fromAttendants); all_open (todos os leads em aberto). Sem indicação, use unassigned para "distribuir" e all_open para "redistribuir", "equilibrar" ou "todos os leads".',
      'mode: equal_split (dividir os leads escolhidos em partes iguais: "de igual modo", "igualmente", "dividir"); balance_totals (deixar todos com a mesma quantidade no total: "equilibrar", "nivelar", "quem tem menos recebe mais").',
      'toAttendants: nomes de quem vai receber. Vazio quer dizer todos os atendentes ativos. "Novos atendentes" são os que entraram por último (veja a data em que cada um entrou; pegue os que entraram na data mais recente ou nos últimos dias, separados dos antigos). Nunca coloque atendente inativo em toAttendants.',
      'Use os nomes exatamente como na lista. stage, source e tag só quando o comando citar; senão null. limit só quando o comando der um número de leads; senão null.',
      `Atendentes: ${people.join('; ') || 'nenhum'}.`,
      `Etapas: ${context.stageNames.join(', ') || 'nenhuma'}.`,
      `Origens: ${context.sources.join(', ') || 'nenhuma'}.`,
      `Etiquetas: ${context.tags.join(', ') || 'nenhuma'}.`,
    ].join('\n'),
    messages: [{ role: 'user', content: command }],
  }, () => undefined, { model, textFormat: LEAD_ASSISTANT_PLAN_FORMAT, timeoutMs: 20_000, maxOutputTokens: 400, safetyIdentifier: session.userId });
  await charge(session, result);
  let raw: unknown = null;
  try { raw = JSON.parse(result.text); } catch { raw = null; }
  const parsed = leadAssistantPlanSchema.safeParse(raw);
  if (!parsed.success) throw new LeadAssistantError(422, 'Não entendi o comando. Tente escrever de outro jeito.');
  return parsed.data;
}

function resolveNames(names: string[], people: Attendant[], onlyActive: boolean) {
  const options = onlyActive ? people.filter((person) => person.active) : people;
  const found: Attendant[] = [];
  for (const name of names) {
    const person = findByName(name, options);
    if (!person) {
      const inactive = onlyActive && findByName(name, people);
      throw new LeadAssistantError(422, inactive
        ? `${inactive.name} está inativo e não pode receber leads.`
        : `Não encontrei o atendente "${name}". Confira o nome em Usuários.`);
    }
    if (!found.some((item) => item.id === person.id)) found.push(person);
  }
  return found;
}

async function resolvePlan(tenantId: string, plan: LeadAssistantPlan, people: Attendant[]): Promise<ResolvedLeadAssistantPlan> {
  const to = plan.toAttendants.length ? resolveNames(plan.toAttendants, people, true) : people.filter((person) => person.active);
  if (!to.length) throw new LeadAssistantError(422, 'Não há atendentes ativos para receber leads.');
  const from = plan.scope === 'from_attendants' ? resolveNames(plan.fromAttendants, people, false) : [];
  if (plan.scope === 'from_attendants' && !from.length) throw new LeadAssistantError(422, 'Diga de qual atendente os leads devem sair.');
  let stageIds: string[] = [];
  let stageName: string | null = null;
  if (plan.stage) {
    const all = await stages(tenantId);
    const names = [...new Map(all.map((stage) => [normalizeName(stage.name), { name: stage.name }])).values()];
    const match = findByName(plan.stage, names);
    if (!match) throw new LeadAssistantError(422, `Não encontrei a etapa "${plan.stage}".`);
    stageName = match.name;
    stageIds = all.filter((stage) => normalizeName(stage.name) === normalizeName(match.name)).map((stage) => stage.id);
  }
  return resolvedLeadAssistantPlanSchema.parse({
    scope: plan.scope,
    mode: plan.mode,
    fromUserIds: from.map((person) => person.id),
    toUserIds: to.map((person) => person.id),
    stageIds,
    stageName,
    source: plan.source?.trim() || null,
    tag: plan.tag?.trim() || null,
    limit: plan.limit && plan.limit > 0 ? Math.min(plan.limit, LEAD_ASSISTANT_MAX_LEADS) : null,
  });
}

function leadFilter(tenantId: string, plan: ResolvedLeadAssistantPlan): Prisma.LeadWhereInput {
  return {
    tenantId,
    status: 'open',
    ...(plan.scope === 'unassigned' ? { assignedTo: null } : {}),
    ...(plan.scope === 'from_attendants' ? { assignedTo: { in: plan.fromUserIds } } : {}),
    ...(plan.stageIds.length ? { stageId: { in: plan.stageIds } } : {}),
    ...(plan.source ? { source: { equals: plan.source, mode: 'insensitive' as const } } : {}),
    ...(plan.tag ? { tags: { has: plan.tag } } : {}),
  };
}

/** The distribution the plan gives right now: which leads change and how each attendant ends up. */
async function computeDistribution(client: Prisma.TransactionClient | typeof prisma, tenantId: string, plan: ResolvedLeadAssistantPlan) {
  const people = await attendants(tenantId);
  const targets = plan.toUserIds.filter((id) => people.some((person) => person.id === id && person.active));
  if (targets.length !== plan.toUserIds.length) throw new LeadAssistantError(409, 'Algum atendente escolhido não está mais ativo. Gere a prévia de novo.');
  const where = leadFilter(tenantId, plan);
  const total = await client.lead.count({ where });
  if (!plan.limit && total > LEAD_ASSISTANT_MAX_LEADS) {
    throw new LeadAssistantError(422, `O comando pega ${total} leads. O máximo por comando é ${LEAD_ASSISTANT_MAX_LEADS}: filtre por etapa, origem ou etiqueta, ou diga quantos leads.`);
  }
  const leads = await client.lead.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: plan.limit || LEAD_ASSISTANT_MAX_LEADS,
    select: { id: true, assignedTo: true },
  });
  const chosen = new Set(leads.map((lead) => lead.id));
  const counts = await client.lead.groupBy({
    by: ['assignedTo'],
    where: { tenantId, status: 'open', assignedTo: { in: targets } },
    _count: { _all: true },
  });
  const openNow = new Map(counts.map((row) => [row.assignedTo as string, row._count._all]));
  const chosenByOwner = new Map<string, number>();
  for (const lead of leads) if (lead.assignedTo) chosenByOwner.set(lead.assignedTo, (chosenByOwner.get(lead.assignedTo) || 0) + 1);
  const base = Object.fromEntries(targets.map((id) => [id, (openNow.get(id) || 0) - (chosenByOwner.get(id) || 0)]));
  const result = planDistribution({ leads, targets, mode: plan.mode, base });
  return { people, leads, chosen, targets, openNow, ...result };
}

function summarize(people: Attendant[], targets: string[], changes: DistributionChange[], openNow: Map<string, number>, totalChosen: number) {
  const name = (id: string | null) => (id ? people.find((person) => person.id === id)?.name || 'Outro usuário' : 'Sem responsável');
  const receives = (id: string) => changes.filter((change) => change.to === id).length;
  const loses = new Map<string, number>();
  for (const change of changes) loses.set(change.from || '', (loses.get(change.from || '') || 0) + 1);
  return {
    chosen: totalChosen,
    moves: changes.length,
    targets: targets.map((id) => ({
      id,
      name: name(id),
      before: openNow.get(id) || 0,
      receives: receives(id),
      losesInside: changes.filter((change) => change.from === id).length,
      after: (openNow.get(id) || 0) + receives(id) - changes.filter((change) => change.from === id).length,
    })),
    from: [...loses].filter(([id]) => !targets.includes(id)).map(([id, count]) => ({ name: name(id || null), count })),
  };
}

/** Command → plan → preview. Nothing changes here. */
export async function previewLeadCommand(session: Session, command: string) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new LeadAssistantError(503, 'O assistente está indisponível no momento.');
  const wallet = await getFlipAiCreditBalanceForTenant(session.tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) throw new LeadAssistantError(402, 'Sem créditos de IA. Adicione créditos para usar o assistente.');

  const [people, stageRows, sourceRows, tagRows] = await Promise.all([
    attendants(session.tenantId),
    stages(session.tenantId),
    prisma.lead.groupBy({ by: ['source'], where: { tenantId: session.tenantId }, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 30 }),
    prisma.$queryRaw<Array<{ tag: string }>>`select distinct unnest(tags) as tag from leads where tenant_id = ${session.tenantId} and status = 'open' limit 60`,
  ]);
  const plan = await interpret(session, command, {
    attendants: people,
    stageNames: [...new Set(stageRows.map((stage) => stage.name))],
    sources: sourceRows.map((row) => row.source),
    tags: tagRows.map((row) => row.tag).filter(Boolean),
  });

  if (plan.action === 'unsupported') return { kind: 'unsupported' as const };

  if (plan.action === 'undo_last') {
    const last = (await recentBatches(session.tenantId)).find((batch) => !batch.undone);
    if (!last) return { kind: 'message' as const, message: 'Não há nenhuma distribuição recente do assistente para desfazer.' };
    return { kind: 'undo' as const, batch: last };
  }

  if (plan.action === 'report') {
    const resolved = await resolvePlan(session.tenantId, { ...plan, scope: 'all_open', toAttendants: [], fromAttendants: [] }, people)
      .catch(() => null);
    const where = resolved ? { ...leadFilter(session.tenantId, resolved), assignedTo: undefined } : { tenantId: session.tenantId, status: 'open' as const };
    const counts = await prisma.lead.groupBy({ by: ['assignedTo'], where, _count: { _all: true } });
    const open = new Map(counts.map((row) => [row.assignedTo, row._count._all]));
    const rows = people
      .filter((person) => person.active || open.get(person.id))
      .map((person) => ({ name: `${person.name}${person.active ? '' : ' (inativo)'}`, count: open.get(person.id) || 0 }));
    const others = counts.filter((row) => row.assignedTo && !people.some((person) => person.id === row.assignedTo))
      .reduce((sum, row) => sum + row._count._all, 0);
    if (others) rows.push({ name: 'Outros usuários (gestores, donos)', count: others });
    rows.push({ name: 'Sem responsável', count: open.get(null) || 0 });
    const filter = resolved ? describeScope({ ...resolved, scope: 'all_open', limit: null }, []) : 'todos os leads em aberto';
    return { kind: 'report' as const, title: `Leads em aberto por atendente (${filter})`, rows };
  }

  const resolved = await resolvePlan(session.tenantId, plan, people);
  const distribution = await computeDistribution(prisma, session.tenantId, resolved);
  const fromNames = resolved.fromUserIds.map((id) => people.find((person) => person.id === id)?.name || '');
  return {
    kind: 'distribution' as const,
    plan: resolved,
    scopeText: describeScope(resolved, fromNames),
    modeText: resolved.mode === 'equal_split' ? 'em partes iguais' : 'equilibrando o total de cada um',
    targetsText: joinNames(distribution.targets.map((id) => people.find((person) => person.id === id)?.name || '')),
    ...summarize(people, distribution.targets, distribution.changes, distribution.openNow, distribution.leads.length),
  };
}

/** Applies a confirmed plan. Recomputed now; if it no longer matches the preview, nothing changes. */
export async function applyLeadPlan(session: Session, plan: ResolvedLeadAssistantPlan, expectedMoves: number, command: string) {
  return prisma.$transaction(async (tx) => {
    const distribution = await computeDistribution(tx, session.tenantId, plan);
    if (distribution.changes.length !== expectedMoves) {
      throw new LeadAssistantError(409, 'Os leads mudaram desde a prévia. Gere a prévia de novo antes de confirmar.');
    }
    if (!distribution.changes.length) return { batchId: null, moves: 0 };
    const byTarget = new Map<string, string[]>();
    for (const change of distribution.changes) byTarget.set(change.to, [...(byTarget.get(change.to) || []), change.leadId]);
    for (const [to, ids] of byTarget) {
      await tx.lead.updateMany({ where: { tenantId: session.tenantId, status: 'open', id: { in: ids } }, data: { assignedTo: to } });
    }
    await tx.auditLog.createMany({
      data: distribution.changes.map((change) => ({
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'lead',
        entityId: change.leadId,
        action: 'lead.updated',
        metadata: {
          changes: ['assignedTo'],
          assignedTo: change.to,
          previousAssignedTo: change.from,
          message: 'Responsável alterado pelo Assistente de leads.',
        },
      })),
    });
    const summary = summarize(distribution.people, distribution.targets, distribution.changes, distribution.openNow, distribution.leads.length);
    const batch = await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'lead_assistant',
        entityId: session.tenantId,
        action: LEAD_ASSISTANT_BATCH_ACTION,
        metadata: {
          command: command.slice(0, 300),
          moves: distribution.changes.length,
          targets: summary.targets.map((target) => ({ name: target.name, receives: target.receives })),
          changes: distribution.changes.map((change) => ({ l: change.leadId, f: change.from, t: change.to })),
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { batchId: batch.id, moves: distribution.changes.length };
  }, { timeout: 30_000 });
}

type BatchChange = { l: string; f: string | null; t: string };

function batchChanges(metadata: unknown): BatchChange[] {
  const changes = metadata && typeof metadata === 'object' ? (metadata as { changes?: unknown }).changes : null;
  if (!Array.isArray(changes)) return [];
  return changes.filter((change): change is BatchChange => !!change && typeof change === 'object'
    && typeof (change as BatchChange).l === 'string' && typeof (change as BatchChange).t === 'string'
    && ((change as BatchChange).f === null || typeof (change as BatchChange).f === 'string'));
}

/** The last changes made by the assistant (30 days), newest first. */
export async function recentBatches(tenantId: string) {
  const batches = await prisma.auditLog.findMany({
    where: { tenantId, action: LEAD_ASSISTANT_BATCH_ACTION, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, createdAt: true, metadata: true, user: { select: { name: true } } },
  });
  const undone = await prisma.auditLog.findMany({
    where: { tenantId, action: LEAD_ASSISTANT_UNDO_ACTION, entityId: { in: batches.map((batch) => batch.id) } },
    select: { entityId: true },
  });
  const undoneIds = new Set(undone.map((row) => row.entityId));
  return batches.map((batch) => {
    const metadata = (batch.metadata || {}) as { command?: unknown; moves?: unknown };
    return {
      id: batch.id,
      at: batch.createdAt.toISOString(),
      by: batch.user?.name || null,
      command: typeof metadata.command === 'string' ? metadata.command : '',
      moves: typeof metadata.moves === 'number' ? metadata.moves : 0,
      undone: undoneIds.has(batch.id),
    };
  });
}

/**
 * Puts back the responsible person of each lead a change moved. A lead that someone changed again
 * afterwards, or that is no longer open, is left as it is.
 */
export async function undoLeadBatch(session: Session, batchId: string) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.auditLog.findFirst({
      where: { id: batchId, tenantId: session.tenantId, action: LEAD_ASSISTANT_BATCH_ACTION },
      select: { id: true, metadata: true },
    });
    if (!batch) throw new LeadAssistantError(404, 'Mudança não encontrada.');
    const already = await tx.auditLog.findFirst({
      where: { tenantId: session.tenantId, action: LEAD_ASSISTANT_UNDO_ACTION, entityId: batch.id },
      select: { id: true },
    });
    if (already) throw new LeadAssistantError(409, 'Essa mudança já foi desfeita.');
    const changes = batchChanges(batch.metadata);
    const current = await tx.lead.findMany({
      where: { tenantId: session.tenantId, id: { in: changes.map((change) => change.l) } },
      select: { id: true, assignedTo: true, status: true },
    });
    const byId = new Map(current.map((lead) => [lead.id, lead]));
    const restore = changes.filter((change) => {
      const lead = byId.get(change.l);
      return lead && lead.status === 'open' && lead.assignedTo === change.t;
    });
    const groups = new Map<string, string[]>();
    for (const change of restore) groups.set(change.f || '', [...(groups.get(change.f || '') || []), change.l]);
    for (const [from, ids] of groups) {
      await tx.lead.updateMany({ where: { tenantId: session.tenantId, id: { in: ids } }, data: { assignedTo: from || null } });
    }
    if (restore.length) {
      await tx.auditLog.createMany({
        data: restore.map((change) => ({
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'lead',
          entityId: change.l,
          action: 'lead.updated',
          metadata: {
            changes: ['assignedTo'],
            assignedTo: change.f,
            previousAssignedTo: change.t,
            message: 'Distribuição do Assistente de leads desfeita.',
          },
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'lead_assistant',
        entityId: batch.id,
        action: LEAD_ASSISTANT_UNDO_ACTION,
        metadata: { restored: restore.length, skipped: changes.length - restore.length },
      },
    });
    return { restored: restore.length, skipped: changes.length - restore.length };
  }, { timeout: 30_000 });
}
