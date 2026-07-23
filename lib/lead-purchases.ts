import { z } from 'zod';
import { formatBRLFromCents } from './currency-brl';

export type CustomerType = 'no_purchase' | 'new_customer' | 'recurring_customer';

export const leadPurchaseSchema = z.object({
  amountCents: z.coerce.number().int().positive('Valor da compra deve ser maior que zero.'),
  currency: z.literal('BRL').optional().default('BRL'),
  purchaseDate: z.string().min(1, 'Data da compra obrigatória.').refine((value) => !Number.isNaN(new Date(value).getTime()), 'Data da compra inválida.'),
  orderNumber: z.string().trim().max(80).optional().nullable(),
  paymentMethod: z.enum(['pix', 'credit_card', 'debit_card', 'cash', 'boleto', 'bank_transfer', 'other']).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export function summarizePurchases(purchases: { amountCents: number; purchaseDate: Date | string }[]) {
  const sorted = [...purchases].sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
  const totalAmountCents = sorted.reduce((sum, purchase) => sum + purchase.amountCents, 0);
  const purchaseCount = sorted.length;
  const customerType: CustomerType = purchaseCount === 0 ? 'no_purchase' : purchaseCount === 1 ? 'new_customer' : 'recurring_customer';
  return {
    totalAmountCents,
    purchaseCount,
    firstPurchaseAt: sorted[0]?.purchaseDate ?? null,
    lastPurchaseAt: sorted.at(-1)?.purchaseDate ?? null,
    averageTicketCents: purchaseCount ? Math.round(totalAmountCents / purchaseCount) : 0,
    customerType,
  };
}

/** Official commercial revenue: only explicit LeadPurchase records count. */
export function getExplicitLeadRevenueCents(lead: { purchases?: { amountCents: number }[] }): number {
  return (lead.purchases || []).reduce((sum, purchase) => sum + (purchase.amountCents > 0 ? purchase.amountCents : 0), 0);
}

/**
 * Compatibility alias retained for exports. Legacy saleValueCents is deliberately
 * excluded so it cannot create revenue without an explicit purchase record.
 */
export function getLeadRevenueSource(lead: { purchases?: { amountCents: number }[] }) {
  const amountCents = getExplicitLeadRevenueCents(lead);
  return { source: amountCents > 0 ? 'purchases' as const : 'none' as const, amountCents };
}

export function purchaseAuditMessage(amountCents: number, action: 'registered' | 'removed') {
  return `Compra de ${formatBRLFromCents(amountCents)} ${action === 'registered' ? 'registrada' : 'removida'}.`;
}
