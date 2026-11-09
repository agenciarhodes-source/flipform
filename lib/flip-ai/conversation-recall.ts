/**
 * What the attendant remembers of a long conversation. People often send many short messages in a
 * row; counted one by one they push older facts (the name, the phone, the CPF already sent) out of
 * the recent history, and the attendant asked for them again. Pure rules, easy to test.
 */

export type HistoryEntry = { id?: string; role: 'user' | 'assistant'; content: string };

/** Joins messages in a row from the same side into one entry (the id is the newest one). */
export function groupConsecutiveTurns(entries: HistoryEntry[]): HistoryEntry[] {
  const grouped: HistoryEntry[] = [];
  for (const entry of entries) {
    const last = grouped[grouped.length - 1];
    if (last && last.role === entry.role) {
      grouped[grouped.length - 1] = { id: entry.id ?? last.id, role: entry.role, content: `${last.content}\n${entry.content}` };
    } else {
      grouped.push({ ...entry });
    }
  }
  return grouped;
}

export type ContactGiven = { phone: boolean; document: boolean };

/**
 * Whether the person already wrote a phone number or a CPF in the conversation. Digits may come
 * with spaces, dots, dashes or parentheses. A phone has 10 to 13 digits (with area code, maybe with
 * 55); a CPF has 11 digits in the ###.###.###-## shape. Longer numbers (a court case) do not count.
 */
export function contactDataGiven(texts: string[]): ContactGiven {
  let phone = false;
  let document = false;
  for (const text of texts) {
    if (!text) continue;
    if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(text)) document = true;
    for (const match of text.matchAll(/\+?\(?\d[\d\s().-]{8,22}\d/g)) {
      const digits = match[0].replace(/\D/g, '');
      if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(match[0].trim())) { document = true; continue; }
      if (digits.length === 11 && /^\d{11}$/.test(match[0].trim()) && !/^\d{2}9/.test(digits)) { document = true; continue; }
      if (digits.length >= 10 && digits.length <= 13) phone = true;
    }
    if (phone && document) break;
  }
  return { phone, document };
}

/** The note the attendant reads when the person already sent contact data earlier. */
export function contactGivenNote(given: ContactGiven) {
  const items = [given.phone ? 'telefone' : null, given.document ? 'CPF' : null].filter(Boolean);
  if (!items.length) return '';
  return [
    `DADOS JÁ ENVIADOS: a pessoa já mandou ${items.join(' e ')} nesta conversa (mesmo que não apareça no trecho do histórico abaixo).`,
    'NÃO peça esses dados de novo. Se ela disser que já mandou ou cobrar retorno, confirme que os dados dela já estão aqui',
    'com a equipe, peça desculpas pela demora em uma frase e siga o que a base de conhecimento manda para esse caso.',
  ].join(' ');
}
