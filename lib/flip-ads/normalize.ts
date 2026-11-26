import { assertAdsScope, assertAdsWindow, type AdsLevel, type AdsScope, type AdsWindow } from './read-plan';

/** One daily row, one provider/account/level; no personal identifiers, raw payload or tokens. */
export type AdsDailyRow = Readonly<{
  tenantId: string; provider: AdsScope['provider']; accountId: string; level: AdsLevel;
  date: string; campaignId: string; campaignName: string | null; groupId: string | null;
  groupName: string | null; adId: string | null; adName: string | null; status: string | null;
  currency: string; spendMicros: number; impressions: number; clicks: number;
}>;
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('ADS_RESPONSE_INVALID');
  return v as Record<string, unknown>;
}
function id(v: unknown) {
  if (typeof v !== 'string' || !/^[0-9]{1,32}$/.test(v)) throw new Error('ADS_ID_INVALID');
  return v;
}
function label(v: unknown) {
  return typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180) : null;
}
function count(v: unknown) {
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error('ADS_METRIC_INVALID');
  if (!/^\d{1,16}$/.test(String(v))) throw new Error('ADS_METRIC_INVALID');
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('ADS_METRIC_INVALID');
  return n;
}
function decimalMicros(v: unknown) {
  if (typeof v !== 'string' || !/^\d{1,10}(\.\d{1,6})?$/.test(v)) throw new Error('ADS_METRIC_INVALID');
  const [whole, frac = ''] = v.split('.');
  const n = Number(whole) * 1_000_000 + Number(frac.padEnd(6, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('ADS_METRIC_INVALID');
  return n;
}
function currency(v: unknown) {
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) throw new Error('ADS_CURRENCY_INVALID');
  return v;
}
function date(v: unknown, window: AdsWindow) {
  if (typeof v !== 'string' || v < window.since || v > window.until) throw new Error('ADS_DATE_INVALID');
  assertAdsWindow({ since: v, until: v });
  return v;
}
function pageRows(v: unknown, limit: number) {
  if (!Array.isArray(v) || v.length > limit) throw new Error('ADS_PAGE_INVALID');
  return v.map(obj);
}
function cursor(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || v.length > 4096 || !/^[A-Za-z0-9_.~+\/=-]+$/.test(v)) throw new Error('ADS_CURSOR_INVALID');
  return v;
}
export function adsRowKey(row: AdsDailyRow) {
  return JSON.stringify([row.tenantId,row.provider,row.accountId,row.level,row.date,row.campaignId,row.groupId,row.adId]);
}
export function normalizeAdsPage(scope: AdsScope, grants: readonly AdsScope[], level: AdsLevel, window: AdsWindow, payload: unknown): { rows: AdsDailyRow[]; nextCursor: string | null } {
  assertAdsScope(scope, grants); assertAdsWindow(window);
  if (!['campaign','group','ad'].includes(level)) throw new Error('ADS_LEVEL_INVALID');
  const root = obj(payload);
  if (root.error) throw new Error('ADS_PROVIDER_ERROR');
  let nextCursor: string | null = null;
  const result: AdsDailyRow[] = [];
  if (scope.provider === 'meta_ads') {
    if (root.paging != null) {
      const paging = obj(root.paging);
      // Never follow provider-supplied URLs; use the opaque cursor with a rebuilt fixed URL.
      if (paging.next) {
        nextCursor = cursor(obj(paging.cursors).after);
        if (!nextCursor) throw new Error('ADS_CURSOR_INVALID');
      }
    }
    for (const r of pageRows(root.data, 100)) {
      if ('act_' + id(r.account_id) !== scope.accountId || r.date_start !== r.date_stop) throw new Error('ADS_SCOPE_MISMATCH');
      result.push({ ...scope, level, date: date(r.date_start, window), campaignId: id(r.campaign_id),
        campaignName: label(r.campaign_name), groupId: level === 'campaign' ? null : id(r.adset_id),
        groupName: level === 'campaign' ? null : label(r.adset_name), adId: level === 'ad' ? id(r.ad_id) : null,
        adName: level === 'ad' ? label(r.ad_name) : null, status: null, currency: currency(r.account_currency),
        spendMicros: decimalMicros(r.spend), impressions: count(r.impressions), clicks: count(r.clicks) });
    }
  } else {
    nextCursor = cursor(root.nextPageToken);
    for (const r of pageRows(root.results ?? [], 10_000)) {
      const customer = obj(r.customer), campaign = obj(r.campaign), metrics = obj(r.metrics);
      if (id(customer.id) !== scope.accountId) throw new Error('ADS_SCOPE_MISMATCH');
      const group = level === 'campaign' ? null : obj(r.adGroup);
      const groupAd = level === 'ad' ? obj(r.adGroupAd) : null;
      const ad = groupAd ? obj(groupAd.ad) : null;
      result.push({ ...scope, level, date: date(obj(r.segments).date, window), campaignId: id(campaign.id),
        campaignName: label(campaign.name), groupId: group ? id(group.id) : null, groupName: group ? label(group.name) : null,
        adId: ad ? id(ad.id) : null, adName: ad ? label(ad.name) : null,
        status: label(groupAd?.status ?? group?.status ?? campaign.status), currency: currency(customer.currencyCode),
        spendMicros: count(metrics.costMicros), impressions: count(metrics.impressions), clicks: count(metrics.clicks) });
    }
  }
  const seen = new Set<string>();
  for (const row of result) {
    const key = adsRowKey(row);
    if (seen.has(key)) throw new Error('ADS_DUPLICATE_ROW');
    seen.add(key);
  }
  return { rows: result, nextCursor };
}
