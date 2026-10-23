/**
 * Which stages the Flip AI may move a lead to. Pure rules, kept apart from the database so they
 * are easy to test.
 *
 * The AI reads every stage of the funnel by its name; a criterion written by the company for a
 * stage takes precedence. Safety limits: never the first stage, never a stage switched off by the
 * company, the final (sale) stage and time-based stages ("Não retorna") only with a written
 * criterion, and never backwards except to an outcome such as "Não qualificado" or "Já é cliente".
 */
export const MANUAL_MOVE_COOLDOWN_HOURS = 24;

/** What each usual stage means, matched by stage name. Order matters: the first match wins. */
/** Written for any business (services, products, law firms, clinics...), not for one company. */
export const STAGE_CRITERION_EXAMPLES: Array<{ match: RegExp; criterion: string }> = [
  { match: /j[aá]\s*(é|e)\s*cliente/i, criterion: 'A pessoa diz que já é cliente da empresa (já comprou, já tem contrato, processo ou atendimento em curso).' },
  { match: /n[aã]o\s*qualific|desqualific|sem\s*perfil/i, criterion: 'A triagem mostrou claramente que a pessoa não tem o perfil para o que a empresa oferece, e não há outro produto ou serviço da empresa que sirva para ela.' },
  { match: /aguardando\s*doc/i, criterion: 'Foram pedidos documentos e a pessoa ainda não mandou nenhum.' },
  { match: /doc\S*\s+incomplet/i, criterion: 'A pessoa mandou só parte dos documentos pedidos.' },
  { match: /doc\S*\s+enviad/i, criterion: 'A pessoa mandou todos os documentos pedidos.' },
  { match: /proposta|or[cç]amento/i, criterion: 'A empresa enviou uma proposta ou orçamento para a pessoa.' },
  { match: /negocia/i, criterion: 'A pessoa tem interesse e está discutindo condições, como preço, prazo ou forma de pagamento.' },
  { match: /visita|reuni[aã]o|agendad|agendament|consulta\s*marcada/i, criterion: 'Ficou combinado um dia e horário para visita, reunião, consulta ou atendimento.' },
  { match: /aguardando\s*retorno|pensando|follow/i, criterion: 'A pessoa disse que vai pensar, consultar alguém ou responder depois, e a conversa ficou à espera da decisão dela.' },
  { match: /contato\s*(feito|inicial|realizado)|em\s*contato|primeiro\s*contato/i, criterion: 'A pessoa respondeu e a conversa começou, mas a triagem ainda não terminou.' },
  { match: /em\s*andamento|em\s*atendimento|qualificad|interessad|oportunidade/i, criterion: 'A triagem foi positiva: a pessoa tem o perfil, quer seguir e a conversa avança para o fechamento.' },
  { match: /fechad|ganh|vendid|assinad|contratad|protocol/i, criterion: 'A pessoa confirmou o fechamento: assinou, pagou ou enviou o contrato ou a procuração assinada.' },
];

/** Stages that depend on time without an answer: the conversation alone cannot show them. */
const TIME_BASED_STAGE = /n[aã]o\s*retorn|sem\s*retorno|sem\s*resposta|n[aã]o\s*respond/i;
/** Outcomes the AI may move a lead to even when they sit earlier in the funnel. */
const OUTCOME_STAGE = /n[aã]o\s*qualific|desqualific|sem\s*perfil|j[aá]\s*(é|e)\s*cliente/i;

/** A stage that closes the sales conversation (not qualified, already a client). */
export function isOutcomeStageName(name: string | null | undefined) {
  return Boolean(name && OUTCOME_STAGE.test(name));
}

export function exampleCriterionFor(stageName: string) {
  return STAGE_CRITERION_EXAMPLES.find((example) => example.match.test(stageName))?.criterion || '';
}

export type StageCandidate = { id: string; name: string; orderIndex: number; criterion: string; written: boolean };

type StageInput = { id: string; name: string; orderIndex: number; isArchived: boolean; rule: { criterion: string; enabled: boolean } | null };

/**
 * Stages the AI may suggest for an open lead. Never touches a closed lead, nor one a person moved
 * in the last 24 hours.
 */
export function candidateStages(input: {
  lead: { status: string; stageOrderIndex: number };
  stages: StageInput[];
  lastManualMoveAt: Date | null;
  now: Date;
}): StageCandidate[] {
  if (input.lead.status !== 'open') return [];
  if (input.lastManualMoveAt
    && input.now.getTime() - input.lastManualMoveAt.getTime() < MANUAL_MOVE_COOLDOWN_HOURS * 3_600_000) return [];
  const active = input.stages.filter((stage) => !stage.isArchived);
  if (!active.length) return [];
  const first = Math.min(...active.map((stage) => stage.orderIndex));
  const last = Math.max(...active.map((stage) => stage.orderIndex));
  const candidates: StageCandidate[] = [];
  for (const stage of active.sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (stage.orderIndex === input.lead.stageOrderIndex || stage.orderIndex === first) continue;
    // A stage the company switched off is never used.
    if (stage.rule && !stage.rule.enabled) continue;
    const written = stage.rule?.criterion.trim() || '';
    if (!written && (stage.orderIndex === last || TIME_BASED_STAGE.test(stage.name))) continue;
    if (stage.orderIndex < input.lead.stageOrderIndex && !OUTCOME_STAGE.test(stage.name)) continue;
    const criterion = written || exampleCriterionFor(stage.name)
      || `Pelo nome da etapa, o lead está exatamente no momento "${stage.name}".`;
    candidates.push({ id: stage.id, name: stage.name, orderIndex: stage.orderIndex, criterion, written: Boolean(written) });
  }
  return candidates;
}

/** The classifier may only answer with one of the stages it was offered. */
export function acceptedSuggestion(
  answer: { move: boolean; stageId: string | null; reason: string } | null,
  candidates: StageCandidate[],
) {
  if (!answer?.move || !answer.stageId) return null;
  const stage = candidates.find((candidate) => candidate.id === answer.stageId);
  const reason = answer.reason.replace(/\s+/g, ' ').trim().slice(0, 400);
  return stage && reason ? { stage, reason } : null;
}
