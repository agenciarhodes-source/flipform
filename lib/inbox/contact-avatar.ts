/**
 * WhatsApp does not give businesses the customer's profile photo, so each contact is shown by
 * the initials of its name on a colour of its own, the same every time the contact appears.
 */

/** How many colours the Inbox palette has; the classes live with the component, where Tailwind reads them. */
export const CONTACT_AVATAR_COLOR_COUNT = 8;

export function contactInitials(name: string | null | undefined) {
  // Stylised letters some people use in their WhatsApp name become plain letters first.
  const plain = String(name || '').normalize('NFKC').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = plain.split(/\s+/).map((word) => word.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  if (words.length) {
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : words[0][1] || '';
    return `${first}${last}`.toUpperCase();
  }
  // A number without a name: its last two digits.
  const digits = plain.replace(/\D/g, '');
  return digits ? digits.slice(-2) : '?';
}

export function contactAvatarColorIndex(key: string | null | undefined) {
  let hash = 0;
  for (const character of String(key || '')) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % CONTACT_AVATAR_COLOR_COUNT;
}
