/**
 * The daily summary of the Flip: the facts it is written from and the plain version used when the
 * company has no AI credits. Pure, easy to test.
 */
export const BRIEFING_FROM_HOUR = 7;

export type BriefingFacts = {
  seesTeam: boolean;
  firstName: string;
  yesterday: { newLeads: number; aiLeads: number; closed: number };
  today: {
    unanswered: number;
    overdueTasks: number;
    hotWithoutTask: number;
    newWithoutContact: number;
    stale: number;
    stageSuggestions: number;
    overloaded: Array<{ name: string; detail: string }>;
  };
  firstPriority: { title: string; detail: string } | null;
};

/** "2026-10-20" and the hour, in Brasília. */
export function brasiliaDayAndHour(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return { day, hour };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The summary without AI: short sentences straight from the numbers. */
export function plainBriefing(facts: BriefingFacts) {
  const lines: string[] = [];
  const y = facts.yesterday;
  lines.push(`Ontem: ${plural(y.newLeads, 'lead novo', 'leads novos')}${y.aiLeads ? ` (${y.aiLeads} pela IA no WhatsApp)` : ''} e ${plural(y.closed, 'fechamento', 'fechamentos')}.`);
  const t = facts.today;
  const pending = [
    t.unanswered && plural(t.unanswered, 'conversa sem resposta', 'conversas sem resposta'),
    t.overdueTasks && plural(t.overdueTasks, 'retorno atrasado', 'retornos atrasados'),
    t.hotWithoutTask && plural(t.hotWithoutTask, 'lead quente sem tarefa', 'leads quentes sem tarefa'),
    t.newWithoutContact && plural(t.newWithoutContact, 'lead novo sem contato', 'leads novos sem contato'),
    t.stageSuggestions && plural(t.stageSuggestions, 'sugestão de etapa para aprovar', 'sugestões de etapa para aprovar'),
    t.stale && plural(t.stale, 'lead parado', 'leads parados'),
  ].filter(Boolean);
  lines.push(pending.length ? `Hoje: ${pending.join(', ')}.` : 'Hoje não há pendências. Bom trabalho!');
  if (facts.seesTeam && t.overloaded.length) {
    lines.push(`Atenção à distribuição: ${t.overloaded.map((item) => `${item.name} (${item.detail})`).join('; ')}.`);
  }
  if (facts.firstPriority) lines.push(`Comece por: ${facts.firstPriority.title} — ${facts.firstPriority.detail}.`);
  return lines.join('\n');
}

export function briefingInstructions(facts: BriefingFacts) {
  return [
    'Você é o Flip, o gestor comercial dentro do FlipForm. Escreva o resumo do dia para a pessoa abaixo.',
    facts.seesTeam ? 'Ela é gestora e vê a equipe toda.' : 'Ela é atendente e vê só o que é dela.',
    `Comece com "Bom dia, ${facts.firstName}!" e escreva de 3 a 6 linhas curtas, em português do Brasil, tom direto e encorajador.`,
    'Use somente os números dados. Não invente dados, nomes nem porcentagens. Termine dizendo por onde começar.',
    'Sem títulos, sem markdown, sem emojis em excesso (no máximo um).',
  ].join('\n');
}
