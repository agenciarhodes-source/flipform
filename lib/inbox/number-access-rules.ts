/**
 * Who sees which WhatsApp number of the company. Pure rules, easy to test.
 *
 * - Nobody is restricted by default: a person with no number marked sees every number.
 * - A person with numbers marked sees only the conversations of those numbers.
 * - The company owner always sees every number (and distributes the conversations).
 * - A conversation from before the company had several numbers (no number recorded) belongs to
 *   the company's first number.
 * - Instagram and other channels are not affected.
 */
export type NumberScope = {
  /** null = every number. */
  allowed: string[] | null;
  /** The company's first number: holds the conversations with no number recorded. */
  legacyNumberId: string | null;
};

export const ALL_NUMBERS: NumberScope = { allowed: null, legacyNumberId: null };

export function numberScopeFor(input: { role: string; markedNumberIds: string[]; legacyNumberId: string | null }): NumberScope {
  if (input.role === 'owner' || input.markedNumberIds.length === 0) return ALL_NUMBERS;
  return { allowed: [...new Set(input.markedNumberIds)], legacyNumberId: input.legacyNumberId };
}

/** Whether a conversation of this channel and number may be seen and answered. */
export function mayUseNumber(scope: NumberScope | undefined, conversation: { channel: string; whatsappConnectionId: string | null }) {
  if (!scope || scope.allowed === null || conversation.channel !== 'whatsapp') return true;
  const number = conversation.whatsappConnectionId ?? scope.legacyNumberId;
  return Boolean(number && scope.allowed.includes(number));
}

/** The numbers a conversation filter may match ("this number"), legacy conversations included. */
export function numberMatch(numberId: string, legacyNumberId: string | null) {
  return numberId === legacyNumberId
    ? { OR: [{ whatsappConnectionId: numberId }, { whatsappConnectionId: null }] }
    : { whatsappConnectionId: numberId };
}

/** Prisma condition for the conversations of the numbers the person sees (any other channel too). */
export function numberScopeWhere(scope: NumberScope | undefined) {
  if (!scope || scope.allowed === null) return null;
  const legacyAllowed = Boolean(scope.legacyNumberId && scope.allowed.includes(scope.legacyNumberId));
  return {
    OR: [
      { channel: { not: 'whatsapp' } },
      { whatsappConnectionId: { in: scope.allowed } },
      ...(legacyAllowed ? [{ whatsappConnectionId: null }] : []),
    ],
  };
}
