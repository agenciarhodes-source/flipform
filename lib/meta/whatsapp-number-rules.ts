/**
 * Several WhatsApp numbers in one company: which number answers a conversation. Pure rules.
 *
 * A conversation is answered by the number it came through. When that number is no longer
 * connected, a company with a single connected number keeps answering through it (as before,
 * e.g. after reconnecting); a company with several numbers never answers through another number
 * (the "Tráfego pago" customer is not answered from the "Carteira" number).
 */
export type NumberChoice<T extends { id: string }> =
  | { kind: 'ok'; connection: T }
  | { kind: 'not_connected' }
  | { kind: 'number_disconnected' };

export function pickConversationNumber<T extends { id: string }>(input: {
  conversationNumberId: string | null;
  connected: T[];
}): NumberChoice<T> {
  if (input.connected.length === 0) return { kind: 'not_connected' };
  if (input.conversationNumberId) {
    const own = input.connected.find((connection) => connection.id === input.conversationNumberId);
    if (own) return { kind: 'ok', connection: own };
    if (input.connected.length > 1) return { kind: 'number_disconnected' };
  }
  return { kind: 'ok', connection: input.connected[0] };
}

/** How a number appears in the company: its name, otherwise the phone. */
export function numberDisplayName(connection: { label?: string | null; displayPhoneNumber?: string | null; verifiedName?: string | null }) {
  const label = String(connection.label || '').trim();
  const phone = String(connection.displayPhoneNumber || '').trim();
  if (label && phone) return `${label} · ${phone}`;
  return label || phone || String(connection.verifiedName || '').trim() || 'WhatsApp';
}

/** A number name: short, plain text. */
export function cleanNumberLabel(value: unknown) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return text || null;
}
