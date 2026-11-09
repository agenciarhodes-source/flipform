import { z } from 'zod';

/**
 * "Assistente de leads": a manager writes a command ("distribua os leads sem responsável entre os
 * novos atendentes") and the AI only turns it into one of these plans. The system then computes a
 * preview, and nothing changes before the manager confirms. Only the responsible person of open
 * leads in the Kanban changes; conversations keep their attendant. Pure rules, easy to test.
 */

export const LEAD_ASSISTANT_ACTIONS = ['distribute', 'report', 'unsupported'] as const;
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
  stage: z.string().max(120).nullable(),
  source: z.string().max(120).nullable(),
  tag: z.string().max(120).nullable(),
  limit: z.number().int().nullable(),
});
export type LeadAssistantPlan = z.infer<typeof leadAssistantPlanSchema>;

export const LEAD_ASSISTANT_PLAN_FORMAT = {
  type: 'json_schema' as const,
  name: 'lead_assistant_plan',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'scope', 'mode', 'fromAttendants', 'toAttendants', 'stage', 'source', 'tag', 'limit'],
    properties: {
      action: { type: 'string', enum: [...LEAD_ASSISTANT_ACTIONS] },
      scope: { type: 'string', enum: [...LEAD_ASSISTANT_SCOPES] },
      mode: { type: 'string', enum: [...LEAD_ASSISTANT_MODES] },
      fromAttendants: { type: 'array', items: { type: 'string' }, description: 'Names, only with scope from_attendants' },
      toAttendants: { type: 'array', items: { type: 'string' }, description: 'Names; empty means every active attendant' },
      stage: { type: ['string', 'null'] },
      source: { type: ['string', 'null'] },
      tag: { type: ['string', 'null'] },
      limit: { type: ['integer', 'null'], description: 'Only when the command gives a number of leads' },
    },
  },
};

/** A plan with names already turned into ids; this is what the confirmation sends back. */
export const resolvedLeadAssistantPlanSchema = z.object({
  scope: z.enum(LEAD_ASSISTANT_SCOPES),
  mode: z.enum(LEAD_ASSISTANT_MODES),
  fromUserIds: z.array(z.string().min(1).max(128)).max(30),
  toUserIds: z.array(z.string().min(1).max(128)).min(1).max(30),
  stageIds: z.array(z.string().min(1).max(128)).max(50),
  stageName: z.string().max(120).nullable(),
  source: z.string().max(120).nullable(),
  tag: z.string().max(120).nullable(),
  limit: z.number().int().min(1).max(LEAD_ASSISTANT_MAX_LEADS).nullable(),
}).strict();
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

/** What the examples in the assistant show. */
export const LEAD_ASSISTANT_EXAMPLES = [
  'Distribua os leads sem responsável igualmente entre os atendentes',
  'Distribua todos os leads de igual modo para os novos atendentes',
  'Passe os leads da Maria para o João e a Ana',
  'Equilibre os leads em aberto entre todos os atendentes',
  'Quantos leads cada atendente tem?',
];

/** The short sentence that says, in plain words, which leads the plan is about. */
export function describeScope(plan: Pick<ResolvedLeadAssistantPlan, 'scope' | 'stageName' | 'source' | 'tag' | 'limit'>, fromNames: string[]) {
  const who = plan.scope === 'unassigned' ? 'leads em aberto sem responsável'
    : plan.scope === 'from_attendants' ? `leads em aberto de ${joinNames(fromNames)}`
      : 'todos os leads em aberto';
  const filters = [
    plan.stageName ? `na etapa "${plan.stageName}"` : null,
    plan.source ? `com origem "${plan.source}"` : null,
    plan.tag ? `com a etiqueta "${plan.tag}"` : null,
  ].filter(Boolean).join(', ');
  const limit = plan.limit ? ` (no máximo ${plan.limit}, os mais antigos primeiro)` : '';
  return `${who}${filters ? ` ${filters}` : ''}${limit}`;
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
