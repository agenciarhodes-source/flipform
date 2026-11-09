import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import {
  cleanTag, describeScope, findByName, joinNames, LEAD_ASSISTANT_MAX_LEADS, LEAD_ASSISTANT_PLAN_FORMAT, leadAssistantPlanSchema,
  normalizeName, planDistribution, planStageMoves, planTagChanges, resolvedLeadAssistantPlanSchema,
  type DistributionChange, type LeadAssistantPlan, type ResolvedLeadAssistantPlan,
} from './rules';

type Session = { tenantId: string; userId: string; role: string };
type Db = Prisma.TransactionClient | typeof prisma;

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

async function stages(client: Db, tenantId: string) {
  return client.pipelineStage.findMany({
    where: { isArchived: false, pipeline: { tenantId, isArchived: false } },
    select: { id: true, name: true, pipelineId: true, orderIndex: true },
  });
}

async function openTags(tenantId: string) {
  const rows = await prisma.$queryRaw<Array<{ tag: string }>>`select distinct unnest(tags) as tag from leads where tenant_id = ${tenantId} limit 200`;
  return rows.map((row) => row.tag).filter(Boolean);
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
      'Você converte um comando de um gestor sobre leads (clientes em potencial) num plano. Você não executa nada.',
      'action: distribute (dividir, distribuir, passar, transferir, redistribuir ou equilibrar leads entre atendentes); move_stage (mover ou mudar leads de etapa, em toStage); tag (colocar, adicionar ou marcar uma etiqueta: tagOperation add; tirar ou remover: tagOperation remove; a etiqueta vai em tagName); report (quantos leads cada atendente tem); undo_last (desfazer a última mudança feita pelo assistente); unsupported (qualquer outra coisa, como apagar leads, mandar mensagem ou uma pergunta sobre resultados).',
      'Filtros de quais leads: scope unassigned (sem responsável), from_attendants (de atendentes citados, em fromAttendants) ou all_open (todos em aberto). Sem indicação, use unassigned para "distribuir" e all_open para o resto. stages: as etapas em que os leads estão agora (pode ser mais de uma). tag: só leads que já têm essa etiqueta. city: cidade do lead. staleDays: leads parados na etapa há pelo menos N dias ("parados há 30 dias", "sem andar há um mês" = 30). source: origem.',
      'Em move_stage, a etapa de destino vai em toStage e NÃO em stages. Em tag, a etiqueta a colocar ou tirar vai em tagName e NÃO em tag.',
      'mode (só em distribute): equal_split (dividir os leads escolhidos em partes iguais: "de igual modo", "igualmente", "dividir"); balance_totals (deixar todos com a mesma quantidade no total: "equilibrar", "nivelar"). Nas outras ações use equal_split.',
      'toAttendants (só em distribute): nomes de quem vai receber. Vazio quer dizer todos os atendentes ativos. "Novos atendentes" são os que entraram por último (veja a data em que cada um entrou). Nunca coloque atendente inativo em toAttendants.',
      'Use os nomes exatamente como na lista. Campos que o comando não cita ficam null (ou lista vazia). limit só quando o comando der um número de leads.',
      `Atendentes: ${people.join('; ') || 'nenhum'}.`,
      `Etapas: ${context.stageNames.join(', ') || 'nenhuma'}.`,
      `Origens: ${context.sources.join(', ') || 'nenhuma'}.`,
      `Etiquetas: ${context.tags.slice(0, 60).join(', ') || 'nenhuma'}.`,
    ].join('\n'),
    messages: [{ role: 'user', content: command }],
  }, () => undefined, { model, textFormat: LEAD_ASSISTANT_PLAN_FORMAT, timeoutMs: 20_000, maxOutputTokens: 500, safetyIdentifier: session.userId });
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

function stageNameOptions(all: Array<{ name: string }>) {
  return [...new Map(all.map((stage) => [normalizeName(stage.name), { name: stage.name }])).values()];
}

async function resolvePlan(tenantId: string, plan: LeadAssistantPlan, people: Attendant[], tags: string[]): Promise<ResolvedLeadAssistantPlan> {
  const action = plan.action as ResolvedLeadAssistantPlan['action'];
  const to = action === 'distribute'
    ? (plan.toAttendants.length ? resolveNames(plan.toAttendants, people, true) : people.filter((person) => person.active))
    : [];
  if (action === 'distribute' && !to.length) throw new LeadAssistantError(422, 'Não há atendentes ativos para receber leads.');
  const from = plan.scope === 'from_attendants' ? resolveNames(plan.fromAttendants, people, false) : [];
  if (plan.scope === 'from_attendants' && !from.length) throw new LeadAssistantError(422, 'Diga de qual atendente são os leads.');

  const all = await stages(prisma, tenantId);
  const names = stageNameOptions(all);
  const filterNames: string[] = [];
  for (const wanted of plan.stages) {
    const match = findByName(wanted, names);
    if (!match) throw new LeadAssistantError(422, `Não encontrei a etapa "${wanted}".`);
    if (!filterNames.includes(match.name)) filterNames.push(match.name);
  }
  const stageIds = all.filter((stage) => filterNames.some((name) => normalizeName(name) === normalizeName(stage.name))).map((stage) => stage.id);

  let toStageName: string | null = null;
  if (action === 'move_stage') {
    const match = plan.toStage ? findByName(plan.toStage, names) : null;
    if (!match) throw new LeadAssistantError(422, plan.toStage ? `Não encontrei a etapa "${plan.toStage}".` : 'Diga para qual etapa os leads devem ir.');
    toStageName = match.name;
  }

  let tagName: string | null = null;
  if (action === 'tag') {
    const wanted = cleanTag(plan.tagName || '');
    if (!wanted || !plan.tagOperation) throw new LeadAssistantError(422, 'Diga qual etiqueta colocar ou tirar.');
    // Reuse the spelling the company already uses, so "Rural" and "rural" do not become two tags.
    tagName = tags.find((tag) => normalizeName(tag) === normalizeName(wanted)) || wanted;
  }
  const tagFilter = plan.tag ? tags.find((tag) => normalizeName(tag) === normalizeName(plan.tag || '')) || cleanTag(plan.tag) : null;

  return resolvedLeadAssistantPlanSchema.parse({
    action,
    scope: plan.scope,
    mode: plan.mode,
    fromUserIds: from.map((person) => person.id),
    toUserIds: to.map((person) => person.id),
    stageIds,
    stageName: filterNames.length ? filterNames.join('", "') : null,
    source: plan.source?.trim() || null,
    tag: tagFilter || null,
    city: plan.city?.trim() || null,
    staleDays: plan.staleDays && plan.staleDays > 0 ? Math.min(plan.staleDays, 3650) : null,
    limit: plan.limit && plan.limit > 0 ? Math.min(plan.limit, LEAD_ASSISTANT_MAX_LEADS) : null,
    toStageName,
    tagOperation: action === 'tag' ? plan.tagOperation : null,
    tagName,
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
    ...(plan.city ? { city: { equals: plan.city, mode: 'insensitive' as const } } : {}),
  };
}

/** The open leads the plan is about, oldest first, after the "stopped for N days" filter and the limit. */
async function selectLeads(client: Db, tenantId: string, plan: ResolvedLeadAssistantPlan) {
  const rows = await client.lead.findMany({
    where: leadFilter(tenantId, plan),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: plan.staleDays ? LEAD_ASSISTANT_MAX_LEADS * 5 : (plan.limit || LEAD_ASSISTANT_MAX_LEADS + 1),
    select: { id: true, assignedTo: true, pipelineId: true, stageId: true, status: true, tags: true, enteredAt: true },
  });
  let leads = rows;
  if (plan.staleDays) {
    const cutoff = new Date(Date.now() - plan.staleDays * 86_400_000);
    const moves = rows.length ? await client.leadStageHistory.groupBy({
      by: ['leadId', 'toStageId'],
      where: { leadId: { in: rows.map((lead) => lead.id) } },
      _max: { createdAt: true },
    }) : [];
    const lastMove = new Map(moves.map((move) => [`${move.leadId}:${move.toStageId}`, move._max.createdAt]));
    leads = rows.filter((lead) => (lastMove.get(`${lead.id}:${lead.stageId}`) || lead.enteredAt) <= cutoff);
  }
  if (plan.limit) leads = leads.slice(0, plan.limit);
  if (leads.length > LEAD_ASSISTANT_MAX_LEADS) {
    throw new LeadAssistantError(422, `O comando pega mais de ${LEAD_ASSISTANT_MAX_LEADS} leads. Filtre por etapa, origem, etiqueta ou cidade, ou diga quantos leads.`);
  }
  return leads;
}

/** The distribution the plan gives right now: which leads change and how each attendant ends up. */
async function computeDistribution(client: Db, tenantId: string, plan: ResolvedLeadAssistantPlan) {
  const people = await attendants(tenantId);
  const targets = plan.toUserIds.filter((id) => people.some((person) => person.id === id && person.active));
  if (targets.length !== plan.toUserIds.length) throw new LeadAssistantError(409, 'Algum atendente escolhido não está mais ativo. Gere a prévia de novo.');
  const leads = await selectLeads(client, tenantId, plan);
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
  return { people, leads, targets, openNow, ...result };
}

/**
 * The stage moves the plan gives right now. The destination is the stage with that name in each
 * lead's own pipeline. Moving to the last stage (won) is refused: it counts as a sale and sends
 * conversions to the ads, so it stays one by one in the Kanban.
 */
async function computeStageMoves(client: Db, tenantId: string, plan: ResolvedLeadAssistantPlan) {
  const all = await stages(client, tenantId);
  const wanted = normalizeName(plan.toStageName || '');
  const lastByPipeline = new Map<string, { id: string; orderIndex: number }>();
  for (const stage of all) {
    const last = lastByPipeline.get(stage.pipelineId);
    if (!last || stage.orderIndex > last.orderIndex) lastByPipeline.set(stage.pipelineId, { id: stage.id, orderIndex: stage.orderIndex });
  }
  const targetByPipeline = new Map<string, { id: string; name: string }>();
  for (const stage of all) {
    if (normalizeName(stage.name) === wanted && !targetByPipeline.has(stage.pipelineId)) targetByPipeline.set(stage.pipelineId, { id: stage.id, name: stage.name });
  }
  const leads = await selectLeads(client, tenantId, plan);
  const result = planStageMoves(leads, targetByPipeline);
  if (result.changes.some((change) => lastByPipeline.get(leads.find((lead) => lead.id === change.leadId)!.pipelineId)?.id === change.toStageId)) {
    throw new LeadAssistantError(422, `"${plan.toStageName}" é a etapa final (lead ganho). Ela conta como venda e envia conversões para os anúncios, então não é feita em massa: mova esses leads um por um no Kanban.`);
  }
  const stageName = new Map(all.map((stage) => [stage.id, stage.name]));
  return { leads, stageName, ...result };
}

async function computeTagChanges(client: Db, tenantId: string, plan: ResolvedLeadAssistantPlan) {
  const leads = await selectLeads(client, tenantId, plan);
  const changes = planTagChanges(leads, plan.tagOperation!, plan.tagName!);
  return { leads, changes, previous: new Map(leads.map((lead) => [lead.id, lead.tags])) };
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

  const [people, stageRows, sourceRows, tags] = await Promise.all([
    attendants(session.tenantId),
    stages(prisma, session.tenantId),
    prisma.lead.groupBy({ by: ['source'], where: { tenantId: session.tenantId }, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 30 }),
    openTags(session.tenantId),
  ]);
  const plan = await interpret(session, command, {
    attendants: people,
    stageNames: [...new Set(stageRows.map((stage) => stage.name))],
    sources: sourceRows.map((row) => row.source),
    tags,
  });

  if (plan.action === 'unsupported') return { kind: 'unsupported' as const };

  if (plan.action === 'undo_last') {
    const last = (await recentBatches(session.tenantId)).find((batch) => !batch.undone);
    if (!last) return { kind: 'message' as const, message: 'Não há nenhuma mudança recente do assistente para desfazer.' };
    return { kind: 'undo' as const, batch: last };
  }

  if (plan.action === 'report') {
    const resolved = await resolvePlan(session.tenantId, { ...plan, action: 'distribute', scope: 'all_open', toAttendants: [], fromAttendants: [] }, people, tags)
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
    const filter = resolved ? describeScope({ ...resolved, scope: 'all_open', limit: null, staleDays: null }, []) : 'todos os leads em aberto';
    return { kind: 'report' as const, title: `Leads em aberto por atendente (${filter})`, rows };
  }

  const resolved = await resolvePlan(session.tenantId, plan, people, tags);
  const fromNames = resolved.fromUserIds.map((id) => people.find((person) => person.id === id)?.name || '');
  const scopeText = describeScope(resolved, fromNames);

  if (resolved.action === 'move_stage') {
    const moves = await computeStageMoves(prisma, session.tenantId, resolved);
    const byStage = new Map<string, number>();
    for (const change of moves.changes) {
      const name = moves.stageName.get(change.fromStageId) || 'Outra etapa';
      byStage.set(name, (byStage.get(name) || 0) + 1);
    }
    return {
      kind: 'stage_change' as const,
      plan: resolved,
      scopeText,
      toStageName: resolved.toStageName,
      closesAsLost: moves.changes.some((change) => change.toStatus === 'lost'),
      chosen: moves.leads.length,
      moves: moves.changes.length,
      fromStages: [...byStage].map(([name, count]) => ({ name, count })),
      already: moves.already,
      noStage: moves.noStage,
    };
  }

  if (resolved.action === 'tag') {
    const tagged = await computeTagChanges(prisma, session.tenantId, resolved);
    return {
      kind: 'tag_change' as const,
      plan: resolved,
      scopeText,
      operation: resolved.tagOperation,
      tagName: resolved.tagName,
      chosen: tagged.leads.length,
      moves: tagged.changes.length,
      unchanged: tagged.leads.length - tagged.changes.length,
    };
  }

  const distribution = await computeDistribution(prisma, session.tenantId, resolved);
  return {
    kind: 'distribution' as const,
    plan: resolved,
    scopeText,
    modeText: resolved.mode === 'equal_split' ? 'em partes iguais' : 'equilibrando o total de cada um',
    targetsText: joinNames(distribution.targets.map((id) => people.find((person) => person.id === id)?.name || '')),
    ...summarize(people, distribution.targets, distribution.changes, distribution.openNow, distribution.leads.length),
  };
}

const STALE_PREVIEW = 'Os leads mudaram desde a prévia. Gere a prévia de novo antes de confirmar.';

async function saveBatch(tx: Prisma.TransactionClient, session: Session, command: string, metadata: Record<string, unknown>) {
  const batch = await tx.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'lead_assistant',
      entityId: session.tenantId,
      action: LEAD_ASSISTANT_BATCH_ACTION,
      metadata: { command: command.slice(0, 300), ...metadata } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return batch.id;
}

/** Writes each lead's tags in one statement (only leads of this company). */
async function writeTags(tx: Prisma.TransactionClient, tenantId: string, rows: Array<{ id: string; tags: string[] }>) {
  if (!rows.length) return;
  await tx.$executeRaw`
    UPDATE leads AS l
    SET tags = ARRAY(SELECT jsonb_array_elements_text(v.tags)), updated_at = NOW()
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(id text, tags jsonb)
    WHERE l.id = v.id AND l.tenant_id = ${tenantId}`;
}

/** Applies a confirmed plan. Recomputed now; if it no longer matches the preview, nothing changes. */
export async function applyLeadPlan(session: Session, plan: ResolvedLeadAssistantPlan, expectedMoves: number, command: string) {
  return prisma.$transaction(async (tx) => {
    if (plan.action === 'move_stage') {
      const moves = await computeStageMoves(tx, session.tenantId, plan);
      if (moves.changes.length !== expectedMoves) throw new LeadAssistantError(409, STALE_PREVIEW);
      if (!moves.changes.length) return { batchId: null, moves: 0 };
      const groups = new Map<string, string[]>();
      for (const change of moves.changes) {
        const key = `${change.toStageId}|${change.toStatus}`;
        groups.set(key, [...(groups.get(key) || []), change.leadId]);
      }
      for (const [key, ids] of groups) {
        const [stageId, status] = key.split('|');
        await tx.lead.updateMany({
          where: { tenantId: session.tenantId, status: 'open', id: { in: ids } },
          data: { stageId, status: status as 'open' | 'lost' },
        });
      }
      await tx.leadStageHistory.createMany({
        data: moves.changes.map((change) => ({ leadId: change.leadId, fromStageId: change.fromStageId, toStageId: change.toStageId, changedBy: session.userId })),
      });
      // No conversion events to Meta or Google: a bulk move is an organization of the board, not a sale.
      await tx.auditLog.createMany({
        data: moves.changes.map((change) => ({
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'lead',
          entityId: change.leadId,
          action: 'lead.moved',
          metadata: {
            fromStageId: change.fromStageId,
            toStageId: change.toStageId,
            newStatus: change.toStatus,
            message: 'Movido pelo Assistente de leads (sem enviar eventos de conversão).',
          },
        })),
      });
      const batchId = await saveBatch(tx, session, command, {
        kind: 'stage',
        moves: moves.changes.length,
        changes: moves.changes.map((change) => ({ l: change.leadId, fs: change.fromStageId, ts: change.toStageId, fst: change.fromStatus, tst: change.toStatus })),
      });
      return { batchId, moves: moves.changes.length };
    }

    if (plan.action === 'tag') {
      const tagged = await computeTagChanges(tx, session.tenantId, plan);
      if (tagged.changes.length !== expectedMoves) throw new LeadAssistantError(409, STALE_PREVIEW);
      if (!tagged.changes.length) return { batchId: null, moves: 0 };
      await writeTags(tx, session.tenantId, tagged.changes.map((change) => ({ id: change.leadId, tags: change.tags })));
      await tx.auditLog.createMany({
        data: tagged.changes.map((change) => ({
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'lead',
          entityId: change.leadId,
          action: 'lead.updated',
          metadata: {
            changes: ['tags'],
            tags: change.tags,
            previousTags: tagged.previous.get(change.leadId) || [],
            message: `Etiqueta "${plan.tagName}" ${plan.tagOperation === 'add' ? 'colocada' : 'tirada'} pelo Assistente de leads.`,
          },
        })),
      });
      const batchId = await saveBatch(tx, session, command, {
        kind: 'tag',
        moves: tagged.changes.length,
        changes: tagged.changes.map((change) => ({ l: change.leadId, p: tagged.previous.get(change.leadId) || [], n: change.tags })),
      });
      return { batchId, moves: tagged.changes.length };
    }

    const distribution = await computeDistribution(tx, session.tenantId, plan);
    if (distribution.changes.length !== expectedMoves) throw new LeadAssistantError(409, STALE_PREVIEW);
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
    const batchId = await saveBatch(tx, session, command, {
      kind: 'assign',
      moves: distribution.changes.length,
      targets: summary.targets.map((target) => ({ name: target.name, receives: target.receives })),
      changes: distribution.changes.map((change) => ({ l: change.leadId, f: change.from, t: change.to })),
    });
    return { batchId, moves: distribution.changes.length };
  }, { timeout: 30_000 });
}

type AssignChange = { l: string; f: string | null; t: string };
type StageBatchChange = { l: string; fs: string; ts: string; fst: string; tst: string };
type TagBatchChange = { l: string; p: string[]; n: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function batchKind(metadata: unknown): 'assign' | 'stage' | 'tag' {
  const kind = isRecord(metadata) ? metadata.kind : null;
  return kind === 'stage' || kind === 'tag' ? kind : 'assign';
}

function batchList(metadata: unknown): unknown[] {
  const changes = isRecord(metadata) ? metadata.changes : null;
  return Array.isArray(changes) ? changes : [];
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

const sameTags = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * Undoes one change of the assistant: each lead goes back to how it was (responsible person,
 * stage or tags). A lead that someone changed again afterwards is left as it is.
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

    const kind = batchKind(batch.metadata);
    const list = batchList(batch.metadata);
    let restored = 0;

    if (kind === 'stage') {
      const changes = list.filter((item): item is StageBatchChange => isRecord(item)
        && typeof item.l === 'string' && typeof item.fs === 'string' && typeof item.ts === 'string'
        && typeof item.fst === 'string' && typeof item.tst === 'string');
      const current = await tx.lead.findMany({
        where: { tenantId: session.tenantId, id: { in: changes.map((change) => change.l) } },
        select: { id: true, stageId: true, status: true },
      });
      const byId = new Map(current.map((lead) => [lead.id, lead]));
      const restore = changes.filter((change) => {
        const lead = byId.get(change.l);
        return lead && lead.stageId === change.ts && lead.status === change.tst && (change.fst === 'open' || change.fst === 'lost');
      });
      const groups = new Map<string, string[]>();
      for (const change of restore) groups.set(`${change.fs}|${change.fst}`, [...(groups.get(`${change.fs}|${change.fst}`) || []), change.l]);
      for (const [key, ids] of groups) {
        const [stageId, status] = key.split('|');
        await tx.lead.updateMany({ where: { tenantId: session.tenantId, id: { in: ids } }, data: { stageId, status: status as 'open' | 'lost' } });
      }
      if (restore.length) {
        await tx.leadStageHistory.createMany({
          data: restore.map((change) => ({ leadId: change.l, fromStageId: change.ts, toStageId: change.fs, changedBy: session.userId })),
        });
        await tx.auditLog.createMany({
          data: restore.map((change) => ({
            tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: change.l, action: 'lead.moved',
            metadata: { fromStageId: change.ts, toStageId: change.fs, newStatus: change.fst, message: 'Mudança de etapa do Assistente de leads desfeita.' },
          })),
        });
      }
      restored = restore.length;
    } else if (kind === 'tag') {
      const changes = list.filter((item): item is TagBatchChange => isRecord(item)
        && typeof item.l === 'string' && isStringArray(item.p) && isStringArray(item.n));
      const current = await tx.lead.findMany({
        where: { tenantId: session.tenantId, id: { in: changes.map((change) => change.l) } },
        select: { id: true, tags: true },
      });
      const byId = new Map(current.map((lead) => [lead.id, lead]));
      const restore = changes.filter((change) => {
        const lead = byId.get(change.l);
        return lead && sameTags(lead.tags, change.n);
      });
      await writeTags(tx, session.tenantId, restore.map((change) => ({ id: change.l, tags: change.p })));
      if (restore.length) {
        await tx.auditLog.createMany({
          data: restore.map((change) => ({
            tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: change.l, action: 'lead.updated',
            metadata: { changes: ['tags'], tags: change.p, previousTags: change.n, message: 'Mudança de etiqueta do Assistente de leads desfeita.' },
          })),
        });
      }
      restored = restore.length;
    } else {
      const changes = list.filter((item): item is AssignChange => isRecord(item)
        && typeof item.l === 'string' && typeof item.t === 'string' && (item.f === null || typeof item.f === 'string'));
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
            tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: change.l, action: 'lead.updated',
            metadata: { changes: ['assignedTo'], assignedTo: change.f, previousAssignedTo: change.t, message: 'Distribuição do Assistente de leads desfeita.' },
          })),
        });
      }
      restored = restore.length;
    }

    const skipped = list.length - restored;
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'lead_assistant',
        entityId: batch.id,
        action: LEAD_ASSISTANT_UNDO_ACTION,
        metadata: { kind, restored, skipped },
      },
    });
    return { restored, skipped };
  }, { timeout: 30_000 });
}
