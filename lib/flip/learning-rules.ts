export const LEARNING_KINDS = {
  phrase: 'Frase que funcionou',
  objection: 'Objeção bem contornada',
  triage: 'Pergunta de triagem',
  explanation: 'Explicação simples',
  closing: 'Fechamento / próximo passo',
  avoid: 'O que evitar',
  other: 'Outra boa prática',
} as const;
export type LearningKind = keyof typeof LEARNING_KINDS;

export const LEARNING_ORIGINS = {
  human_success: 'Atendimento da equipe que deu certo',
  human_failure: 'Atendimento da equipe que não avançou',
  ai_review: 'Supervisão da IA',
} as const;
export type LearningOrigin = keyof typeof LEARNING_ORIGINS;

export const LEARNING_SECTION = '## Aprendizados do atendimento humano';
export const LEARNING_MAX_SUGGESTIONS = 8;
export const GENERAL_TOPIC = 'Geral';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes personal data before a conversation leaves the system: e-mails, documents, phone and
 * long numbers, and the person's own names (from the lead and the WhatsApp profile).
 */
export function anonymizeText(text: string, names: Array<string | null | undefined>) {
  let value = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[número]');
  const words = new Set<string>();
  for (const name of names) {
    for (const word of (name || '').split(/\s+/)) {
      const clean = word.replace(/[^\p{L}'-]/gu, '');
      if (clean.length >= 3) words.add(clean);
    }
  }
  for (const word of words) value = value.replace(new RegExp(`(?<![\\p{L}])${escapeRegExp(word)}(?![\\p{L}])`, 'giu'), '[nome]');
  return value;
}

/** A short theme name ("Geral" when the practice fits any service). */
export function cleanTopic(value: unknown) {
  const topic = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!topic || /^(geral|todos|todas|qualquer)/i.test(topic)) return GENERAL_TOPIC;
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

/** Keeps the model's suggestions that are complete, short and of a known kind and origin. */
export function parseLearningSuggestions(raw: unknown) {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { suggestions?: unknown }).suggestions)
    ? (raw as { suggestions: unknown[] }).suggestions : [];
  const out: Array<{ kind: LearningKind; origin: LearningOrigin; topic: string; title: string; content: string; example: string | null; conversations: number }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const kind = (typeof value.kind === 'string' && value.kind in LEARNING_KINDS ? value.kind : 'other') as LearningKind;
    const origin: LearningOrigin = value.origin === 'human_failure' || kind === 'avoid' ? 'human_failure' : 'human_success';
    const title = typeof value.title === 'string' ? value.title.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const content = typeof value.content === 'string' ? value.content.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
    if (title.length < 4 || content.length < 20) continue;
    const example = typeof value.example === 'string' && value.example.trim() ? value.example.trim().slice(0, 400) : null;
    const conversations = Math.max(1, Math.min(50, Math.round(Number(value.conversations) || 1)));
    // A lesson from a conversation that did not work is always something to avoid.
    out.push({ kind: origin === 'human_failure' ? 'avoid' : kind, origin, topic: cleanTopic(value.topic), title, content, example, conversations });
    if (out.length >= LEARNING_MAX_SUGGESTIONS) break;
  }
  return out;
}

type ApprovedLearning = { kind: string; topic: string | null; title: string; content: string };

function line(item: ApprovedLearning) {
  return `- **${item.title.replace(/\s+/g, ' ').trim()}:** ${item.content.replace(/\s+/g, ' ').trim()}`;
}

/**
 * The company's approved learnings, grouped by theme ("Geral" first), with the practices to
 * follow and the ones to avoid apart. Empty when there is nothing approved.
 */
export function buildLearningSection(items: ApprovedLearning[]) {
  if (!items.length) return '';
  const topics = new Map<string, ApprovedLearning[]>();
  for (const item of items) {
    const topic = cleanTopic(item.topic);
    topics.set(topic, [...(topics.get(topic) || []), item]);
  }
  const order = [...topics.keys()].sort((a, b) => (a === GENERAL_TOPIC ? -1 : b === GENERAL_TOPIC ? 1 : a.localeCompare(b, 'pt-BR')));
  const blocks = order.map((topic) => {
    const group = topics.get(topic) || [];
    const follow = group.filter((item) => item.kind !== 'avoid');
    const avoid = group.filter((item) => item.kind === 'avoid');
    return [
      `### ${topic === GENERAL_TOPIC ? 'Geral (vale para qualquer atendimento)' : topic}`,
      ...(follow.length ? ['', 'Faça:', ...follow.map(line)] : []),
      ...(avoid.length ? ['', 'Evite:', ...avoid.map(line)] : []),
    ].join('\n');
  });
  return [
    LEARNING_SECTION,
    '',
    'Boas práticas e cuidados tirados dos atendimentos da empresa, aprovados pelo escritório. Use cada tema no contexto certo.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

/**
 * Puts the company's learnings in the Markdown Mestre: the section is rebuilt from the approved
 * list (so a removed learning leaves every attendant), and everything else stays exactly as it was.
 */
export function replaceLearningSection(markdown: string, items: ApprovedLearning[]) {
  const section = buildLearningSection(items);
  const body = markdown.replace(/\s+$/, '');
  const start = body.indexOf(LEARNING_SECTION);
  if (start === -1) return section ? `${body}\n\n---\n\n${section}\n` : `${body}\n`;
  const next = body.indexOf('\n## ', start + LEARNING_SECTION.length);
  const before = body.slice(0, start).replace(/(\s*---\s*)?\s*$/, '');
  const after = next === -1 ? '' : body.slice(next).replace(/^\s+/, '');
  if (!section) return `${[before, after].filter(Boolean).join('\n\n')}\n`;
  return `${[`${before}\n\n---\n\n${section}`, after].filter(Boolean).join('\n\n')}\n`;
}
