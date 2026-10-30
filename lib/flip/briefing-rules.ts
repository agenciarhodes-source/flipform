/**
 * The daily summary of the Flip: the facts it is written from and the plain version used when the
 * company has no AI credits. Pure, easy to test.
 */
export const BRIEFING_FROM_HOUR = 7;

export type BriefingFacts = {
  seesTeam: boolean;
  firstName: string;
  yesterday: {
    newLeads: number;
    aiLeads: number;
    closed: number;
    /** Where yesterday's leads came from (the 3 biggest sources). */
    sources?: Array<{ source: string; leads: number }>;
    /** Conversations where customers wrote yesterday, by channel (managers only). */
    channels?: Array<{ channel: string; conversations: number }>;
    /** Sales registered yesterday. */
    sales?: { count: number; total: string } | null;
  };
  /** The month so far, next to the same days of last month. */
  month?: { leads: number; closed: number; lastMonthLeads: number; lastMonthClosed: number } | null;
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

/** The first name to greet, or empty when the profile name looks like an e-mail or a system login. */
export function greetingName(name: string | null | undefined) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  if (!first || /[@._\d]/.test(first) || first.length > 20) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The summary without AI: short sentences straight from the numbers. */
export function plainBriefing(facts: BriefingFacts) {
  const lines: string[] = [];
  const y = facts.yesterday;
  lines.push(`Ontem: ${plural(y.newLeads, 'lead novo', 'leads novos')}${y.aiLeads ? ` (${y.aiLeads} pela IA no WhatsApp)` : ''} e ${plural(y.closed, 'fechamento', 'fechamentos')}.`);
  if (y.sources?.length) lines.push(`Origem dos leads de ontem: ${y.sources.map((item) => `${item.source} (${item.leads})`).join(', ')}.`);
  if (y.channels?.length) lines.push(`Conversas com clientes ontem: ${y.channels.map((item) => `${item.channel} ${item.conversations}`).join(', ')}.`);
  if (y.sales?.count) lines.push(`Vendas registradas ontem: ${y.sales.count} (${y.sales.total}).`);
  if (facts.month) {
    const m = facts.month;
    lines.push(`No mês até agora: ${plural(m.leads, 'lead', 'leads')} e ${plural(m.closed, 'fechamento', 'fechamentos')} (no mesmo ponto do mês passado: ${m.lastMonthLeads} e ${m.lastMonthClosed}).`);
  }
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
    `Comece com "Bom dia${facts.firstName ? `, ${facts.firstName}` : ''}!" e escreva 2 ou 3 parágrafos curtos (de 8 a 12 linhas no total), em português do Brasil, tom direto e encorajador.`,
    'Primeiro parágrafo: como foi ontem (leads, de onde vieram, conversas por canal, fechamentos e vendas).',
    'Segundo: o mês até agora comparado com o mesmo ponto do mês passado, dizendo se está acima ou abaixo (só se houver os números do mês).',
    'Terceiro: o que pede atenção hoje (pendências e distribuição da equipe) e por onde começar.',
    'Use somente os números dados. Não invente dados, nomes nem porcentagens. Separe os parágrafos com uma linha em branco.',
    'Sem títulos, sem markdown, sem emojis em excesso (no máximo um).',
  ].join('\n');
}
