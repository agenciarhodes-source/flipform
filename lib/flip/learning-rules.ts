export const LEARNING_KINDS = {
  phrase: 'Frase que funcionou',
  objection: 'Objeção bem contornada',
  triage: 'Pergunta de triagem',
  explanation: 'Explicação simples',
  closing: 'Fechamento / próximo passo',
  other: 'Outra boa prática',
} as const;
export type LearningKind = keyof typeof LEARNING_KINDS;

export const LEARNING_SECTION = '## Aprendizados do atendimento humano';
export const LEARNING_MAX_SUGGESTIONS = 8;

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

/** Keeps the model's suggestions that are complete, short and of a known kind. */
export function parseLearningSuggestions(raw: unknown) {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { suggestions?: unknown }).suggestions)
    ? (raw as { suggestions: unknown[] }).suggestions : [];
  const out: Array<{ kind: LearningKind; title: string; content: string; example: string | null; conversations: number }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const kind = (typeof value.kind === 'string' && value.kind in LEARNING_KINDS ? value.kind : 'other') as LearningKind;
    const title = typeof value.title === 'string' ? value.title.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const content = typeof value.content === 'string' ? value.content.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
    if (title.length < 4 || content.length < 20) continue;
    const example = typeof value.example === 'string' && value.example.trim() ? value.example.trim().slice(0, 400) : null;
    const conversations = Math.max(1, Math.min(50, Math.round(Number(value.conversations) || 1)));
    out.push({ kind, title, content, example, conversations });
    if (out.length >= LEARNING_MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Adds an approved learning to the Markdown Mestre, in its own section at the end (created the
 * first time). Everything else in the document stays exactly as it was.
 */
export function appendLearningSection(markdown: string, item: { title: string; content: string }) {
  const line = `- **${item.title.replace(/\s+/g, ' ').trim()}:** ${item.content.replace(/\s+/g, ' ').trim()}`;
  const body = markdown.replace(/\s+$/, '');
  const start = body.indexOf(LEARNING_SECTION);
  if (start === -1) {
    return `${body}\n\n---\n\n${LEARNING_SECTION}\n\nBoas práticas tiradas de atendimentos da equipe que deram certo, aprovadas pelo escritório.\n\n${line}\n`;
  }
  const next = body.indexOf('\n## ', start + LEARNING_SECTION.length);
  if (next === -1) return `${body}\n${line}\n`;
  const before = body.slice(0, next).replace(/\s+$/, '');
  return `${before}\n${line}\n${body.slice(next)}\n`;
}
