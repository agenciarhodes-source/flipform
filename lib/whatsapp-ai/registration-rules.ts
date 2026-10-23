/**
 * Rules for a WhatsApp contact who already registered (a form of the company) before writing.
 * Global for every company: the name to confirm comes from the registration, not from the
 * WhatsApp profile, and the first reply says where the contact came from.
 */

/** First name of the registration, written normally ("LUIZA BEATRIZ" -> "Luiza"). */
export function registrationFirstName(name: string | null | undefined) {
  const clean = (name || '').replace(/[^\p{L}\p{M}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const first = clean.split(' ')[0] || '';
  if (first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Date of the registration in Brasília time, as dd/mm/aaaa. */
export function registrationDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

/** "hoje", "ontem" or "no dia dd/mm/aaaa", in Brasília time. */
export function registrationWhen(registeredAt: Date, now: Date) {
  const day = registrationDate(registeredAt);
  if (day === registrationDate(now)) return 'hoje';
  if (day === registrationDate(new Date(now.getTime() - 86_400_000))) return 'ontem';
  return `no dia ${day}`;
}

/** Instruction for the first AI reply to a person who came from a company form. */
export function registrationNote(input: { companyName: string; registeredAt: Date; now: Date }) {
  const when = registrationWhen(input.registeredAt, input.now);
  return `CADASTRO: esta pessoa já se cadastrou no formulário de ${input.companyName} ${when}`
    + ` (${registrationDate(input.registeredAt)}). Nesta primeira resposta, diga com naturalidade que recebeu o contato`
    + ` dela pelo cadastro que ela fez ${when} no formulário de ${input.companyName}, e siga o atendimento.`
    + ' Não peça de novo os dados que ela já informou no cadastro só para confirmar.';
}

/**
 * Which name the AI uses. For a lead that came from a registration (not opened by the AI), the
 * AI asks once, on its first reply, "Posso te chamar de <first name of the registration>?";
 * after that it uses the name the person gave or, without an answer, the registration first name.
 */
export function registrationNameState(input: {
  registeredName: string | null | undefined;
  /** The name the person told the AI, when recorded. */
  preferredName: string | null | undefined;
  aiRepliesSoFar: number;
}) {
  const first = registrationFirstName(input.registeredName);
  const preferred = (input.preferredName || '').trim() || null;
  if (preferred) return { knownName: preferred, nameToConfirm: first };
  if (input.aiRepliesSoFar === 0) return { knownName: null, nameToConfirm: first };
  return { knownName: first, nameToConfirm: first };
}
