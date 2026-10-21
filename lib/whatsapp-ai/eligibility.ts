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
  /** handback: someone of the team handed the conversation to the AI (or asked it to answer) now. */
  trigger: 'message' | 'no_reply_sweep' | 'handback';
}): WhatsAppAiDecision {
  const { settings } = input;
  if (!settings.enabled) return { answer: false, reason: 'disabled' };
  if (!settings.agentId) return { answer: false, reason: 'no_agent' };
  if (!settings.liveEnabled && !isTestPhoneNumber(settings.testPhoneNumbers, input.customerWaId)) {
    return { answer: false, reason: 'not_test_number' };
  }
  // A person chose the AI for this conversation now, so the hours set for the number do not hold it back.
  if (input.trigger === 'handback') return { answer: true };
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
 * On WhatsApp there is no panel showing the links of external sources, so the "[Fonte externa N]"
 * marks are taken out of the text and the pages actually cited go at the end (at most two).
 */
export function withWhatsAppSourceLinks(text: string, sources: Array<{ url: string }>) {
  const cited: number[] = [];
  const clean = text
    .replace(/\s*\[\s*fontes?\s+externas?\s*([^\]]*)\]/gi, (_mark, inside: string) => {
      for (const digits of inside.match(/\d+/g) || []) cited.push(Number(digits));
      return '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const urls = [...new Set(cited)]
    .map((number) => sources[number - 1]?.url)
    .filter((url): url is string => typeof url === 'string' && url.startsWith('https://'))
    .slice(0, 2);
  return urls.length ? `${clean}\n\nFonte: ${urls.join('\n')}` : clean;
}

/** WhatsApp marks bold with one asterisk; models often write Markdown with two. */
const NAME_PREFIXES = /^(?:(?:pode\s+)?me\s+chamar\s+de|me\s+chamo|meu\s+nome\s+(?:é|e)|(?:eu\s+)?sou(?:\s+(?:o|a))?|é|e)\s+/i;
const YES = /^(?:sim|pode|pode\s+sim|pode\s+ser|claro|isso|ok|certo|com\s+certeza)\b/i;
const NOT_A_NAME = /^(?:sim|não|nao|ok|obrigad[oa]|bom\s+dia|boa\s+tarde|boa\s+noite|oi|olá|ola)$/i;

/**
 * The name in the customer's answer, when the AI's last message asked how to call them.
 * "Diego", "pode me chamar de Diego", or "sim" to "Posso te chamar de Diego?" (the profile name).
 * Anything that does not look like a short name is ignored.
 */
export function nameFromReply(question: string | null | undefined, answer: string, profileFirstName: string | null) {
  if (!question || !/cham(?:ad[oa]|ar)|seu nome|como (?:posso|devo)/i.test(question)) return null;
  const text = answer.trim().replace(/[.!]+$/, '');
  if (YES.test(text) && profileFirstName) {
    const rest = text.replace(YES, '').replace(/^[,\s]+/, '');
    if (!rest) return profileFirstName;
  }
  const name = text.replace(YES, '').replace(/^[,\s]+/, '').replace(NAME_PREFIXES, '').trim();
  if (!/^\p{L}[\p{L}\p{M}' -]{1,40}$/u.test(name) || name.split(/\s+/).length > 4 || NOT_A_NAME.test(name)) return null;
  return name.split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function toWhatsAppText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
