import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Flip AI wallet and consumption per company for Admin > Clientes.
 * Read-only and expressed only in commercial credits: the wallet belongs to
 * the tenant, never to an individual login.
 */

export type ClientFlipAiSummary = {
  balanceCredits: number;
  consumedCredits30d: number;
  addedCredits30d: number;
};

const WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

const EMPTY: ClientFlipAiSummary = { balanceCredits: 0, consumedCredits30d: 0, addedCredits30d: 0 };

/** Returns null when the wallet cannot be read, so the client list still loads. */
export async function getClientFlipAiSummaries(
  tenantIds: string[],
  now = new Date(),
): Promise<Map<string, ClientFlipAiSummary> | null> {
  const summaries = new Map<string, ClientFlipAiSummary>();
  if (tenantIds.length === 0) return summaries;
  const since = new Date(now.getTime() - WINDOW_MS);

  try {
    const [accounts, movements] = await Promise.all([
      prisma.flipAiCreditAccount.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, balanceCredits: true },
      }),
      prisma.flipAiCreditLedgerEntry.groupBy({
        by: ['tenantId', 'entryType'],
        where: { tenantId: { in: tenantIds }, createdAt: { gte: since, lte: now } },
        _sum: { amountCredits: true },
      }),
    ]);

    const entry = (tenantId: string) => {
      const current = summaries.get(tenantId) || { ...EMPTY };
      summaries.set(tenantId, current);
      return current;
    };
    for (const account of accounts) entry(account.tenantId).balanceCredits = account.balanceCredits;

    const refunded = new Map<string, number>();
    for (const movement of movements) {
      const amount = movement._sum.amountCredits || 0;
      if (movement.entryType === 'debit') entry(movement.tenantId).consumedCredits30d = amount;
      else if (movement.entryType === 'credit') entry(movement.tenantId).addedCredits30d = amount;
      else if (movement.entryType === 'refund') refunded.set(movement.tenantId, amount);
    }
    // A refund returns credits to the wallet, so it reduces the period's net consumption.
    refunded.forEach((amount, tenantId) => {
      const current = entry(tenantId);
      current.consumedCredits30d = Math.max(0, current.consumedCredits30d - amount);
    });
    return summaries;
  } catch {
    return null;
  }
}

export function resolveClientFlipAiSummary(
  summaries: Map<string, ClientFlipAiSummary> | null,
  tenantId: string,
): ClientFlipAiSummary | null {
  if (!summaries) return null;
  return summaries.get(tenantId) || { ...EMPTY };
}
