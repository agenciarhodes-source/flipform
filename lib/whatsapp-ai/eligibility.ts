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
  trigger: 'message' | 'no_reply_sweep';
}): WhatsAppAiDecision {
  const { settings } = input;
  if (!settings.enabled) return { answer: false, reason: 'disabled' };
  if (!settings.agentId) return { answer: false, reason: 'no_agent' };
  if (!settings.liveEnabled && !isTestPhoneNumber(settings.testPhoneNumbers, input.customerWaId)) {
    return { answer: false, reason: 'not_test_number' };
  }
  if (settings.scheduleMode === 'outside_hours' && settings.businessHours
    && isWithinBusinessHours(settings.businessHours, input.now)) {
    return { answer: false, reason: 'business_hours' };
  }
  if (settings.scheduleMode === 'no_reply' && input.trigger === 'message') {
    return { answer: false, reason: 'waits_for_team' };
  }
  return { answer: true };
}

/** WhatsApp marks bold with one asterisk; models often write Markdown with two. */
export function toWhatsAppText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
