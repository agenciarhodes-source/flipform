/**
 * Whether the Flip AI may answer a WhatsApp message now. Pure rules, so they are easy to test:
 * the number has the AI on, the person is a test number or the AI is released to everyone,
 * and it is a time the company chose for the AI.
 */
export const WHATSAPP_AI_TIMEZONE = 'America/Sao_Paulo';
export const WHATSAPP_AI_QUIET_SECONDS = 8;

export type WhatsAppAiRuleSettings = {
  enabled: boolean;
  agentId: string | null;
  scheduleMode: string;
  businessHours: { days: number[]; start: string; end: string } | null;
  liveEnabled: boolean;
  testPhoneNumbers: string[];
};

export type WhatsAppAiDecision =
  | { answer: true }
  | { answer: false; reason: 'disabled' | 'no_agent' | 'not_test_number' | 'business_hours' | 'waits_for_team' };

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

/**
 * The forms one Brazilian mobile can take on WhatsApp: with or without the country code and with or
 * without the extra 9 after the area code. Other countries are compared as written.
 */
export function phoneVariants(value: string) {
  let digits = digitsOnly(value);
  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') variants.add(digits.slice(0, 2) + digits.slice(3));
  if (digits.length === 10) variants.add(digits.slice(0, 2) + '9' + digits.slice(2));
  for (const local of [...variants]) {
    const bare = local.startsWith('55') && local.length >= 12 ? local.slice(2) : local;
    variants.add(bare);
    variants.add('55' + bare);
  }
  return variants;
}

export function isTestPhoneNumber(testNumbers: string[], waId: string) {
  const target = phoneVariants(waId);
  return testNumbers.some((number) => [...phoneVariants(number)].some((variant) => target.has(variant)));
}

/** Day of the week (0 = Sunday) and HH:MM in Brasília time. */
export function brasiliaClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WHATSAPP_AI_TIMEZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, time: `${get('hour')}:${get('minute')}` };
}

export function isWithinBusinessHours(hours: { days: number[]; start: string; end: string }, now: Date) {
  const clock = brasiliaClock(now);
  return hours.days.includes(clock.day) && clock.time >= hours.start && clock.time < hours.end;
}

/**
 * Right after a message arrives. "Quando ninguém responder" is answered later, by the sweep that
 * finds conversations the team left without reply for the minutes chosen.
 */
export function decideWhatsAppAiAnswer(input: {
  settings: WhatsAppAiRuleSettings;
  customerWaId: string;
  now: Date;
  /** handback: someone of the team handed the conversation to the AI (or asked it to answer) now.
   * closer_takeover: the attendant was switched to Closer and takes back what it handed over. */
  trigger: 'message' | 'no_reply_sweep' | 'handback' | 'closer_takeover';
}): WhatsAppAiDecision {
  const { settings } = input;
  if (!settings.enabled) return { answer: false, reason: 'disabled' };
  if (!settings.agentId) return { answer: false, reason: 'no_agent' };
  if (!settings.liveEnabled && !isTestPhoneNumber(settings.testPhoneNumbers, input.customerWaId)) {
    return { answer: false, reason: 'not_test_number' };
  }
  // A person chose the AI for this conversation now, so the hours set for the number do not hold it back.
  if (input.trigger === 'handback' || input.trigger === 'closer_takeover') return { answer: true };
  if (settings.scheduleMode === 'outside_hours' && settings.businessHours
    && isWithinBusinessHours(settings.businessHours, input.now)) {
    return { answer: false, reason: 'business_hours' };
  }
  if (settings.scheduleMode === 'no_reply' && input.trigger === 'message') {
    return { answer: false, reason: 'waits_for_team' };
  }
  return { answer: true };
}

/**
 * On WhatsApp a conversation never ends with "Fonte: <link>": it reads like a robot and the links
 * are long. The "[Fonte externa N]" marks and any "Fonte:" line with a link are taken out; the
 * sources stay recorded with the reply. A link the customer asked for, inside the text, stays.
 */
export function withWhatsAppSourceLinks(text: string, _sources: Array<{ url: string }> = []) {
  return text
    .replace(/\s*\[\s*fontes?\s+externas?\s*[^\]]*\]/gi, '')
    .replace(/^[ \t]*(?:fontes?|refer[êe]ncias?)[ \t]*:[^\n]*https?:\/\/[^\n]*(?:\n[ \t]*https?:\/\/[^\n]*)*/gim, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** WhatsApp marks bold with one asterisk; models often write Markdown with two. */
const NAME_PREFIXES = /^(?:(?:pode\s+)?me\s+chamar\s+de|me\s+chamo|meu\s+nome\s+(?:é|e)|(?:eu\s+)?sou(?:\s+(?:o|a))?|é|e)\s+/i;
const NAME_QUESTION = /cham(?:ad[oa]|ar)|seu nome|como (?:posso|devo)/i;
const OFFERED_NAME = /\bposso\s+(?:te|lhe)\s+chamar\s+de\s+([\p{L}\p{M}'-]{2,40})\s*\?/iu;
const NAME_PREFERENCE = /\b(?:prefiro(?:\s+que\s+(?:me\s+)?chame\s+de)?|(?:pode\s+)?(?:me\s+)?cham(?:ar|a|e)\s+de|meu\s+nome\s+(?:é|e)|me\s+chamo)\s+([\p{L}\p{M}' -]{2,48})\s*[.!]?\s*$/iu;
const EXPLICIT_NAME = /^\s*(?:meu\s+nome\s+(?:é|e)|me\s+chamo|(?:pode\s+)?me\s+cham(?:ar|a|e)\s+de)\s+([\p{L}\p{M}' -]{2,48})\s*[.!]?\s*$/iu;

const YES_REPLIES = new Set([
  'sim', 's', 'c', 'si', 'yes', 'yeah', 'yep', 'yup', 'sure', 'claro', 'isso', 'isso mesmo', 'iso', 'iso mesmo',
  'pode', 'pode sim', 'pode ser', 'pode chamar', 'pode chamar sim', 'pode me chamar',
  'pode me chamar assim', 'claro pode sim', 'ok', 'certo', 'com certeza', 'aham', 'uhum',
  'exato', 'positivo', 'confirmo', 'beleza', 'blz', 'tudo bem', 'ta', 'ta bom',
]);
const NOT_NAMES = new Set([
  ...YES_REPLIES, 'n', 'nao', 'no', 'nope', 'negativo', 'prefiro nao',
  'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'obrigado', 'obrigada', 'valeu', 'vlw',
  'la ele', 'laele', 'sei la', 'eita', 'oxente', 'kkk', 'rs', 'haha', 'hum', 'ah',
  'cliente', 'contato', 'loja', 'vendas', 'atendimento', 'mae', 'pai',
]);

/** Only conversational yes/no words, never arbitrary text. A one-letter "C" is a yes
 * ONLY when answering an explicit "Posso te chamar de X?" question. */
function normalizedReply(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[-_.]/g, '').replace(/[!?;,'"()]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/(\p{L})\1+/gu, '$1');
}
export function isAffirmation(value: string | null | undefined) {
  return YES_REPLIES.has(normalizedReply(value || ''));
}

/** Reject confirmations, regional expressions and sentences before storing a preferred name.
 * This is global for any tenant: no customer-specific vocabulary or company data. */
export function plausibleName(value: string | null | undefined) {
  const name = (value || '').trim();
  if (!/^[\p{L}\p{M}][\p{L}\p{M}' -]{1,50}$/u.test(name)) return null;
  if (name.split(/\s+/).length > 4 || /(\p{L})\1\1/iu.test(name) || NOT_NAMES.has(normalizedReply(name))) return null;
  if (/^(?:eu|quero|preciso|meu|pode|vou|tenho|sou)\s/i.test(name)) return null;
  return name;
}
function titleName(name: string) {
  return name.split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

/** Explicit self-introduction, even if the assistant did not ask about the person's name.
 * Never infer identity from a standalone "sim", an aside or model-generated identity.name. */
/** If a suggested name was refused or the reply was only a regional expression,
 * ask for a preferred name once in an open-ended way. Never restart the question loop. */
export function shouldClarifyName(question: string | null | undefined, answer: string) {
  if (!question || !OFFERED_NAME.test(question)) return false;
  if (nameFromReply(question, answer, null)) return false;
  const normalized = normalizedReply(answer);
  return /^(?:nao|no|nope|n|negativo|prefiro nao)(?:\b|$)/.test(normalized)
    || new Set(['la ele', 'laele', 'sei la', 'eita', 'oxente', 'k', 'rs', 'hum', 'ah']).has(normalized);
}

export function explicitNameFromMessage(message: string) {
  const match = message.trim().match(EXPLICIT_NAME);
  const candidate = match ? plausibleName(match[1]) : null;
  return candidate ? titleName(candidate) : null;
}

/** Interprets the last ACTUAL name question and the customer's answer together.
 * "ss", "C", "sí" and "yes" confirm the name in that question, not the literal reply.
 * An open name question ("Como posso te chamar?") has no name to confirm. */
export function nameFromReply(question: string | null | undefined, answer: string, _profileFirstName: string | null) {
  if (!question || !NAME_QUESTION.test(question)) return null;
  const offered = question.match(OFFERED_NAME);
  const offeredName = offered ? plausibleName(offered[1]) : null;
  const text = answer.trim().replace(/[.!]+$/, '');

  // A correction takes precedence over a "yes": "sim, mas prefiro Ana".
  const preferred = text.match(NAME_PREFERENCE);
  const preferredName = preferred ? plausibleName(preferred[1]) : null;
  if (preferredName) return titleName(preferredName);
  if (isAffirmation(text)) return offeredName ? titleName(offeredName) : null;
  if (['nao', 'n', 'no', 'nope', 'negativo'].includes(normalizedReply(text))) return null;

  const unprefixed = text.replace(/^(?:sim|si|yes|yeah|pode|claro|ok)\b[\s,;]*/i, '').replace(NAME_PREFIXES, '').trim();
  const candidate = plausibleName(unprefixed);
  return candidate ? titleName(candidate) : null;
}

export function toWhatsAppText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
