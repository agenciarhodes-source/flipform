/**
 * Whether a contact name is clearly the person's first name, so the AI can ask
 * "Posso te chamar de X?". Global for every company: WhatsApp profile and form names are often
 * not a name at all ("Rf", "JR", "Mãe", "Loja Bela", "Vendas", "Deus é fiel"), and then the AI
 * asks "Como posso te chamar?" instead. Deterministic, no AI call.
 */

const NOT_A_FIRST_NAME = new Set([
  // Courtesy words and replies
  'sim', 'nao', 'ok', 'oi', 'ola', 'bom', 'boa', 'obrigado', 'obrigada',
  // Family and affection
  'mae', 'mamae', 'pai', 'papai', 'vo', 'vovo', 'avo', 'tia', 'tio', 'filho', 'filha', 'irmao', 'irma',
  'amor', 'vida', 'bebe', 'princesa', 'gatinha', 'gata', 'linda', 'lindo', 'baby',
  // Titles and roles
  'dr', 'dra', 'doutor', 'doutora', 'sr', 'sra', 'senhor', 'senhora', 'dona', 'seu', 'prof', 'professor', 'professora',
  'advogado', 'advogada', 'adv', 'pastor', 'pastora',
  // Business and generic profile words
  'cliente', 'contato', 'loja', 'vendas', 'venda', 'comercial', 'empresa', 'atendimento', 'suporte', 'financeiro',
  'oficial', 'ltda', 'eireli', 'whatsapp', 'zap', 'user', 'usuario', 'teste', 'test', 'admin', 'escritorio', 'consultoria', 'store',
  // Faith phrases often used as profile names
  'deus', 'jesus', 'fe', 'gratidao', 'abencoado', 'abencoada',
]);

function plain(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Words placed before a name ("Dona Maria", "Dr. Paulo"): the name is the next word. */
const TITLES = new Set(['dona', 'dr', 'dra', 'sr', 'sra', 'seu', 'prof', 'doutor', 'doutora', 'senhor', 'senhora']);

/** The first name, written normally ("RAFAELA souza" -> "Rafaela"), or null when it is not clearly a name. */
export function clearFirstName(value: string | null | undefined): string | null {
  const words = (value || '').replace(/[^\p{L}\p{M}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const first = words.find((word) => !TITLES.has(plain(word))) || '';
  const key = plain(first).replace(/['-]/g, '');
  // Initials and abbreviations: "Rf", "JR", "A".
  if (key.length < 3) return null;
  // A name has vowels and no long run of consonants or of the same letter ("Xbtrk", "Aaaa", "Kkkk").
  if (!/[aeiouy]/.test(key) || /[^aeiouy]{4,}/.test(key) || /(.)\1\1/.test(key)) return null;
  if (NOT_A_FIRST_NAME.has(key)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** The question the AI ends with while it does not know how the person likes to be called. */
export function nameQuestion(profileName: string | null | undefined) {
  const first = clearFirstName(profileName);
  return first ? `"Posso te chamar de ${first}?"` : '"Como posso te chamar?"';
}

/** Whether one of the AI's earlier messages already asked how to call the person. */
export function askedForName(texts: Array<string | null | undefined>) {
  return texts.some((text) => /posso te chamar|como (?:posso|devo) (?:te |lhe )?chamar|prefere ser chamad[oa]|qual (?:é )?o seu nome|como (?:é )?o seu nome/i.test(text || ''));
}
