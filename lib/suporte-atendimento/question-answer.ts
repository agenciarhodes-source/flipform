/**
 * Respostas extrativas: selecionar trechos do Markdown APROVADO, não inventar.
 * Execução local, sem API externa e sem dados de clientes. JEV futuro apenas
 * para classificar a intenção, sujeito à aprovação de tratamento de dados.
 */
export type SupportResult = { title: string; excerpt: string; matchScore: number; index: number };
export const STOPWORDS = new Set([
  'qual','quais','como','para','pra','com','sem','uma','um','uns','umas','que',
  'de','da','do','das','dos','em','no','na','nos','nas','por','isso','ter','tem',
  'preciso','precisa','cliente','gostaria','pode','saber','sobre','tenho','meu',
  'minha','ele','ela','the','and','perguntar','sou','estou','ser','ao','aos',
]);

export function supportTerms(raw: string): string[] {
  const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [...new Set((folded.match(/[a-z0-9]+/g) || []).filter((part) => part.length >= 3 && !STOPWORDS.has(part)))];
}

export function findSupportAnswers(question: string, markdown: string): SupportResult[] {
  const terms = supportTerms(question);
  if (!terms.length || question.length > 1000) return [];
  const chunks = markdown.split(/^##\s+/m).slice(1);
  return chunks.map((chunk, index) => {
    const splitAt = chunk.indexOf('\n');
    const title = (splitAt >= 0 ? chunk.slice(0, splitAt) : chunk).trim();
    const body = splitAt >= 0 ? chunk.slice(splitAt + 1) : '';
    const normalizedTitle = supportTerms(title);
    const normalizedBody = supportTerms(body);
    const titleTokens = new Set(normalizedTitle);
    const bodyTokens = new Set(normalizedBody);
    const hitCount = terms.filter((t) => titleTokens.has(t) || bodyTokens.has(t)).length;
    const titleHits = terms.filter((t) => titleTokens.has(t)).length;
    const coverage = hitCount / terms.length;
    // Nunca responder com correspondência de uma única palavra incidental quando
    // a dúvida tem vários termos significativos.
    const score = (coverage >= 0.55 ? coverage * 4 : 0) + titleHits * 1.5;
    const excerpt = body
      .split(/\n\s*\n/)
      .filter((p) => p.trim() && !p.trim().startsWith('|') && !p.trim().startsWith('#'))
      .sort((a, b) => {
        const aHits = terms.filter((t) => supportTerms(a).includes(t)).length;
        const bHits = terms.filter((t) => supportTerms(b).includes(t)).length;
        return bHits - aHits;
      })[0]?.replace(/\*\*/g, '').replace(/^\s*>\s*/gm, '').slice(0, 900) || '';
    return { title, excerpt, matchScore: score, index };
  })
    .filter((result) => result.matchScore >= 2 && result.excerpt.length > 15)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}
