import { adsRowKey, type AdsDailyRow } from './normalize';

/** Only independently reconciled CRM outcomes for the same tenant/account/period/currency.
 * Unavailable outcomes are null, not zero. No inference from UTM names, provider conversions
 * or a lead's pipeline stage. The actual CRM reconciliation is not implemented here. */
export type ReconciledOutcomes = Readonly<{
  tenantId: string; provider: AdsDailyRow['provider']; accountId: string; currency: string;
  since: string; until: string; leads: number; contracts: number; revenueMicros: number;
}>;
export function campaignMetrics(rows: readonly AdsDailyRow[], outcomes: ReconciledOutcomes | null = null) {
  if (!rows.length) return null;
  const first = rows[0];
  const dates = rows.map(r => r.date).sort();
  const since = dates[0], until = dates[dates.length - 1];
  const keys = new Set<string>();
  let spendMicros = 0, clicks = 0, impressions = 0;
  for (const r of rows) {
    if (r.level !== 'campaign' || r.tenantId !== first.tenantId || r.provider !== first.provider ||
      r.accountId !== first.accountId || r.currency !== first.currency || keys.has(adsRowKey(r))) throw new Error('ADS_AGGREGATE_SCOPE_INVALID');
    keys.add(adsRowKey(r));
    spendMicros += r.spendMicros; clicks += r.clicks; impressions += r.impressions;
    if (![spendMicros,clicks,impressions].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('ADS_METRIC_OVERFLOW');
  }
  if (outcomes && (outcomes.tenantId !== first.tenantId || outcomes.provider !== first.provider || outcomes.accountId !== first.accountId ||
    outcomes.currency !== first.currency || outcomes.since !== since || outcomes.until !== until ||
    ![outcomes.leads,outcomes.contracts,outcomes.revenueMicros].every(n => Number.isSafeInteger(n) && n >= 0))) throw new Error('ADS_OUTCOME_SCOPE_INVALID');
  const spend = spendMicros / 1_000_000;
  return { currency: first.currency, spendMicros, clicks, impressions, since, until,
    ctrPercent: impressions ? clicks / impressions * 100 : null,
    cpc: clicks ? spend / clicks : null,
    cpl: outcomes?.leads ? spend / outcomes.leads : null,
    cpa: outcomes?.contracts ? spend / outcomes.contracts : null,
    roas: outcomes && spendMicros ? outcomes.revenueMicros / spendMicros : null };
}
