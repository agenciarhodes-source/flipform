/**
 * "Regras fixas do atendimento": a section of the company's Master Markdown that goes, whole, into
 * every reply of the attendant. The rest of the file is searched by similarity and only the closest
 * parts reach each reply, so behaviour rules there (mission, how to close, what never to ask) were
 * often missing. Pure rules, easy to test; global for every company.
 */

export const FIXED_RULES_MAX_CHARS = 6_000;

const FIXED_RULES_HEADING = /^(#{1,3})\s*regras fixas do atendimento\b.*$/im;

/** The text of the "Regras fixas do atendimento" section, or null when the file has none. */
export function extractFixedRules(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const text = markdown.replace(/\r\n/g, '\n');
  const match = FIXED_RULES_HEADING.exec(text);
  if (!match) return null;
  const level = match[1].length;
  const rest = text.slice(match.index + match[0].length);
  // The section ends at the next heading of the same or a higher level.
  const next = new RegExp(`^#{1,${level}}\\s`, 'm').exec(rest);
  let body = (next ? rest.slice(0, next.index) : rest).trim();
  if (!body) return null;
  if (body.length > FIXED_RULES_MAX_CHARS) {
    const cut = body.slice(0, FIXED_RULES_MAX_CHARS);
    const lastLine = cut.lastIndexOf('\n');
    body = (lastLine > FIXED_RULES_MAX_CHARS / 2 ? cut.slice(0, lastLine) : cut).trim();
  }
  return body;
}

/** How the fixed rules are given to the attendant. */
export function fixedRulesPrompt(rules: string | null) {
  if (!rules) return '';
  return [
    'REGRAS FIXAS DA EMPRESA (valem em toda resposta e prevalecem sobre o roteiro geral desta conversa, inclusive sobre como encerrar, quando chamar a equipe e o que fazer quando parece não haver caminho; só não prevalecem sobre segurança, ética e as permissões de ação):',
    rules,
    'FIM DAS REGRAS FIXAS DA EMPRESA',
  ].join('\n');
}
