/**
 * Normalizes a phone number for WhatsApp's wa.me URL format.
 *
 * Brazilian local numbers receive country code 55. International numbers are
 * accepted only when explicitly prefixed with + or 00, so a malformed local
 * value cannot inadvertently become a wa.me link.
 */
export function normalizeWhatsAppPhone(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  const hasInternationalPrefix = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');

  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (!hasInternationalPrefix && digits.startsWith('0')) {
    const withoutLeadingZero = digits.replace(/^0+/, '');
    if (withoutLeadingZero.length === 10 || withoutLeadingZero.length === 11) {
      digits = withoutLeadingZero;
    }
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (!hasInternationalPrefix && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }

  if (hasInternationalPrefix && digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return null;
}

export function buildWhatsAppUrl(
  value: string | null | undefined,
): string | null {
  const phone = normalizeWhatsAppPhone(value);

  return phone ? `https://wa.me/${phone}` : null;
}
