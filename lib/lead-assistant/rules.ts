import { z } from 'zod';

/**
 * "Assistente de leads": in the Flip search bar a manager writes a command ("distribua os leads
 * sem responsável entre os novos atendentes") and the AI only turns it into one of these plans.
 * The system computes a preview and nothing changes before the manager confirms. It can split
 * leads among attendants, move them to another stage, and add or remove a tag. Bulk stage moves
 * never send conversion events to Meta or Google and never mark leads as won.
 * Pure rules, easy to test.
 */

export const LEAD_ASSISTANT_ACTIONS = ['distribute', 'move_stage', 'tag', 'report', 'undo_last', 'unsupported'] as const;
/** The actions that change leads (each one is confirmed and can be undone). */
export const LEAD_ASSISTANT_CHANGE_ACTIONS = ['distribute', 'move_stage', 'tag'] as const;
export type LeadAssistantChangeAction = (typeof LEAD_ASSISTANT_CHANGE_ACTIONS)[number];
export const LEAD_ASSISTANT_TAG_OPERATIONS = ['add', 'remove'] as const;
/** Which open leads a command is about. */
export const LEAD_ASSISTANT_SCOPES = ['unassigned', 'all_open', 'from_attendants'] as const;
/**
 * equal_split: the chosen leads are split in equal parts among the attendants.
 * balance_totals: the chosen leads go first to who has fewer open leads, to even out the totals.
 */
export const LEAD_ASSISTANT_MODES = ['equal_split', 'balance_totals'] as const;

/** The most leads one command may change, so a misunderstanding never reaches the whole base. */
export const LEAD_ASSISTANT_MAX_LEADS = 2_000;

export const leadAssistantPlanSchema = z.object({
  action: z.enum(LEAD_ASSISTANT_ACTIONS),
  scope: z.enum(LEAD_ASSISTANT_SCOPES),
  mode: z.enum(LEAD_ASSISTANT_MODES),
  fromAttendants: z.array(z.string().max(120)).max(30),
  toAttendants: z.array(z.string().max(120)).max(30),
  stages: z.array(z.string().max(120)).max(20),
  source: z.string().max(120).nullable(),
  tag: z.string().max(120).nullable(),
  city: z.string().max(120).nullable(),
  staleDays: z.number().int().nullable(),
  limit: z.number().int().nullable(),
  toStage: z.string().max(120).nullable(),
  tagOperation: z.enum(LEAD_ASSISTANT_TAG_OPERATIONS).nullable(),
  tagName: z.string().max(60).nullable(),
});
export type LeadAssistantPlan = z.infer<typeof leadAssistantPlanSchema>;

export const LEAD_ASSISTANT_PLAN_FORMAT = {
  type: 'json_schema' as const,
  name: 'lead_assistant_plan',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'scope', 'mode', 'fromAttendants', 'toAttendants', 'stages', 'source', 'tag', 'city', 'staleDays', 'limit',
      'toStage', 'tagOperation', 'tagName'],
    properties: {
      action: { type: 'string', enum: [...LEAD_ASSISTANT_ACTIONS] },
      scope: { type: 'string', enum: [...LEAD_ASSISTANT_SCOPES] },
      mode: { type: 'string', enum: [...LEAD_ASSISTANT_MODES] },
      fromAttendants: { type: 'array', items: { type: 'string' }, description: 'Names, only with scope from_attendants' },
      toAttendants: { type: 'array', items: { type: 'string' }, description: 'Names; empty means every active attendant' },
      stages: { type: 'array', items: { type: 'string' }, description: 'Filter: the stages the leads are in now' },
      source: { type: ['string', 'null'] },
      tag: { type: ['string', 'null'], description: 'Filter: leads that already have this tag' },
      city: { type: ['string', 'null'] },
      staleDays: { type: ['integer', 'null'], description: 'Filter: leads stopped in their stage for at least this many days' },
      limit: { type: ['integer', 'null'], description: 'Only when the command gives a number of leads' },
      toStage: { type: ['string', 'null'], description: 'move_stage: the stage to move the leads to' },
      tagOperation: { type: ['string', 'null'], enum: [...LEAD_ASSISTANT_TAG_OPERATIONS, null] },
      tagName: { type: ['string', 'null'], description: 'tag: the tag to add or remove' },
    },
  },
};

/** A plan with names already turned into ids; this is what the confirmation sends back. */
export const resolvedLeadAssistantPlanSchema = z.object({
  action: z.enum(LEAD_ASSISTANT_CHANGE_ACTIONS),
  scope: z.enum(LEAD_ASSISTANT_SCOPES),
  mode: z.enum(LEAD_ASSISTANT_MODES),
  fromUserIds: z.array(z.string().min(1).max(128)).max(30),
  toUserIds: z.array(z.string().min(1).max(128)).max(30),
  stageIds: z.array(z.string().min(1).max(128)).max(100),
  stageName: z.string().max(400).nullable(),
  source: z.string().max(120).nullable(),
  tag: z.string().max(120).nullable(),
  city: z.string().max(120).nullable(),
  staleDays: z.number().int().min(1).max(3650).nullable(),
  limit: z.number().int().min(1).max(LEAD_ASSISTANT_MAX_LEADS).nullable(),
  toStageName: z.string().max(120).nullable(),
  tagOperation: z.enum(LEAD_ASSISTANT_TAG_OPERATIONS).nullable(),
  tagName: z.string().min(1).max(60).nullable(),
}).strict().superRefine((plan, ctx) => {
  if (plan.action === 'distribute' && !plan.toUserIds.length) ctx.addIssue({ code: 'custom', message: 'toUserIds' });
  if (plan.action === 'move_stage' && !plan.toStageName) ctx.addIssue({ code: 'custom', message: 'toStageName' });
  if (plan.action === 'tag' && (!plan.tagOperation || !plan.tagName)) ctx.addIssue({ code: 'custom', message: 'tag' });
});
export type ResolvedLeadAssistantPlan = z.infer<typeof resolvedLeadAssistantPlanSchema>;

export function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The one option a name points to: an exact match, or a single partial match. */
export function findByName<T extends { name: string }>(wanted: string, options: T[]): T | null {
  const target = normalizeName(wanted);
  if (!target) return null;
  const exact = options.filter((option) => normalizeName(option.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = options.filter((option) => {
    const name = normalizeName(option.name);
    return name.startsWith(`${target} `) || name.includes(target) || target.includes(name);
  });
  return partial.length === 1 ? partial[0] : null;
}

export type DistributionLead = { id: string; assignedTo: string | null };
export type DistributionChange = { leadId: string; from: string | null; to: string };

/**
 * Splits the chosen leads among the target attendants with the fewest moves.
 * `base` is how many open leads each target already holds outside the chosen ones; with
 * equal_split it is ignored, so the chosen leads alone are split in equal parts.
 * Leads already with a target stay with it while that target is within its share.
 */
export function planDistribution(input: {
  leads: DistributionLead[];
  targets: string[];
  mode: (typeof LEAD_ASSISTANT_MODES)[number];
  base?: Record<string, number>;
}) {
  const targets = [...new Set(input.targets)];
  if (!targets.length) return { changes: [] as DistributionChange[], shares: {} as Record<string, number>, kept: {} as Record<string, number> };

  // How many of the chosen leads each target should end with (fill the lowest first).
  const start = new Map(targets.map((id) => [id, input.mode === 'balance_totals' ? Math.max(0, input.base?.[id] || 0) : 0]));
  const shares = new Map(targets.map((id) => [id, 0]));
  for (let i = 0; i < input.leads.length; i += 1) {
    let pick = targets[0];
    for (const id of targets) {
      if ((start.get(id)! + shares.get(id)!) < (start.get(pick)! + shares.get(pick)!)) pick = id;
    }
    shares.set(pick, shares.get(pick)! + 1);
  }

  // Keep leads that already belong to a target, up to its share.
  const kept = new Map(targets.map((id) => [id, 0]));
  const toMove: DistributionLead[] = [];
  for (const lead of input.leads) {
    const owner = lead.assignedTo;
    if (owner && shares.has(owner) && kept.get(owner)! < shares.get(owner)!) {
      kept.set(owner, kept.get(owner)! + 1);
    } else {
      toMove.push(lead);
    }
  }

  // The others go, in turn, to the targets that still have room.
  const changes: DistributionChange[] = [];
  const room = () => targets.filter((id) => kept.get(id)! < shares.get(id)!);
  let turn = 0;
  for (const lead of toMove) {
    const open = room();
    const to = open[turn % open.length];
    turn += 1;
    kept.set(to, kept.get(to)! + 1);
    if (lead.assignedTo !== to) changes.push({ leadId: lead.id, from: lead.assignedTo, to });
  }
  return {
    changes,
    shares: Object.fromEntries(shares),
    kept: Object.fromEntries(targets.map((id) => [id, shares.get(id)! - changes.filter((change) => change.to === id).length])),
  };
}

export type StageLead = { id: string; pipelineId: string; stageId: string; status: string };
export type StageChange = { leadId: string; fromStageId: string; toStageId: string; fromStatus: string; toStatus: string };

/** The status a lead gets in a stage, like the Kanban: "Perdido" closes it as lost; other stages keep it open. */
export function statusForStage(stageName: string) {
  return normalizeName(stageName) === 'perdido' ? 'lost' : 'open';
}

/**
 * Moves leads to the stage with the given name in their own pipeline. Leads whose pipeline has no
 * such stage, or that are already there, stay as they are.
 */
export function planStageMoves(leads: StageLead[], targetByPipeline: Map<string, { id: string; name: string }>) {
  const changes: StageChange[] = [];
  let already = 0;
  let noStage = 0;
  for (const lead of leads) {
    const target = targetByPipeline.get(lead.pipelineId);
    if (!target) { noStage += 1; continue; }
    if (target.id === lead.stageId) { already += 1; continue; }
    changes.push({ leadId: lead.id, fromStageId: lead.stageId, toStageId: target.id, fromStatus: lead.status, toStatus: statusForStage(target.name) });
  }
  return { changes, already, noStage };
}

export type TagLead = { id: string; tags: string[] };
export type TagChange = { leadId: string; tags: string[] };

/** A tag as stored: trimmed, single spaces, at most 60 characters. */
export function cleanTag(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Adds or removes one tag (ignoring upper and lower case); leads that would not change are left out. */
export function planTagChanges(leads: TagLead[], operation: (typeof LEAD_ASSISTANT_TAG_OPERATIONS)[number], tag: string) {
  const wanted = normalizeName(tag);
  const changes: TagChange[] = [];
  for (const lead of leads) {
    const has = lead.tags.some((item) => normalizeName(item) === wanted);
    if (operation === 'add' && !has) changes.push({ leadId: lead.id, tags: [...lead.tags, tag] });
    if (operation === 'remove' && has) changes.push({ leadId: lead.id, tags: lead.tags.filter((item) => normalizeName(item) !== wanted) });
  }
  return changes;
}

/** Command examples the Flip bar shows to managers. */
export const LEAD_ASSISTANT_EXAMPLES = [
  'Distribua os leads sem responsável entre os atendentes',
  'Mova os leads parados há 30 dias em Não retorna para Perdido',
  'Coloque a etiqueta rural nos leads de Picos',
  'Quantos leads cada atendente tem?',
];

const COMMAND_VERBS = /\b(distribu|redistribu|divid|repart|pass[ae]r?\b|passe\b|transfer|atribu|equilibr|nivel|desfa[cz]|desfaz|mov[ae]r?\b|move\b|mude\b|mudar\b|coloqu|colocar|adicion|acrescent|inclu[ai]|tir[ae]r?\b|remov|retir|marqu|marcar|etiquet)/;
const ABOUT_LEADS = /\b(leads?|carteiras?|atendentes?|distribuic\w*|clientes?|etiquetas?|tags?)\b/;
const OWNERSHIP_REPORT = /\bquant[oa]s?\b.*\bleads?\b.*\b(cada|por)\s+(atendente|vendedor|pessoa)/;

/**
 * Whether a text typed in the Flip bar is a command for the lead assistant (distribute, move,
 * tag, undo, or how many leads each attendant holds) instead of a question about the numbers.
 */
export function looksLikeLeadCommand(text: string) {
  const clean = normalizeName(text);
  if (OWNERSHIP_REPORT.test(clean)) return true;
  return COMMAND_VERBS.test(clean) && ABOUT_LEADS.test(clean);
}

/** The short sentence that says, in plain words, which leads the plan is about. */
export function describeScope(
  plan: Pick<ResolvedLeadAssistantPlan, 'scope' | 'stageName' | 'source' | 'tag' | 'limit'> & Partial<Pick<ResolvedLeadAssistantPlan, 'city' | 'staleDays'>>,
  fromNames: string[],
) {
  const who = plan.scope === 'unassigned' ? 'leads em aberto sem responsável'
    : plan.scope === 'from_attendants' ? `leads em aberto de ${joinNames(fromNames)}`
      : 'todos os leads em aberto';
  const filters = [
    plan.stageName ? `${plan.stageName.includes('", "') ? 'nas etapas' : 'na etapa'} "${plan.stageName}"` : null,
    plan.source ? `com origem "${plan.source}"` : null,
    plan.tag ? `com a etiqueta "${plan.tag}"` : null,
    plan.city ? `de ${plan.city}` : null,
    plan.staleDays ? `parados na etapa há ${plan.staleDays} dias ou mais` : null,
  ].filter(Boolean).join(', ');
  const limit = plan.limit ? ` (no máximo ${plan.limit}, os mais antigos primeiro)` : '';
  return `${who}${filters ? ` ${filters}` : ''}${limit}`;
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
