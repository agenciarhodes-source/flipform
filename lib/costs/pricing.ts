/**
 * Prices used to estimate the cost of the operation. The official bill is Meta's (WhatsApp) and the
 * credit wallet (AI); these numbers are for the cost panel only and are easy to update.
 */
export const WHATSAPP_PRICES_SNAPSHOT = '2026-10-01';
/** US$ per billed WhatsApp message in Brazil, by category. Replies inside the 24-hour window are free. */
export const WHATSAPP_USD_PER_MESSAGE_BR: Record<string, number> = {
  marketing: 0.0625,
  utility: 0.0068,
  authentication: 0.0068,
  authentication_international: 0.0068,
  service: 0,
};

/** What Meta says about one message: whether it was billed, and the category. */
export type MetaPricing = { billable: boolean; category: string | null; pricingModel: string | null };

export function parseMetaPricing(raw: unknown): MetaPricing | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.billable !== 'boolean' && typeof value.category !== 'string') return null;
  return {
    billable: value.billable === true,
    category: typeof value.category === 'string' ? value.category.toLowerCase() : null,
    pricingModel: typeof value.pricing_model === 'string' ? value.pricing_model : null,
  };
}

export function whatsappMessageCostUsd(pricing: MetaPricing | null) {
  if (!pricing?.billable || !pricing.category) return 0;
  return WHATSAPP_USD_PER_MESSAGE_BR[pricing.category] ?? 0;
}

/** First and last instant of a month ("2026-10"), in Brasília. */
export function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const index = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(year, index, 1, 3));
  const end = new Date(Date.UTC(year, index + 1, 1, 3));
  const previousStart = new Date(Date.UTC(year, index - 1, 1, 3));
  const label = `${year}-${String(index + 1).padStart(2, '0')}`;
  return { start, end, previousStart, label };
}

/** Costs are kept in dollars, as Meta and the AI provider charge them. Small values keep 4 decimals. */
export function usd(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 2,
  });
}
