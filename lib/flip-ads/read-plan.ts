/** Fixed read-only query plans. No transport, tokens, environment activation or user-defined GAQL. */
export type AdsProvider = 'meta_ads' | 'google_ads';
export type AdsLevel = 'campaign' | 'group' | 'ad';
export type AdsScope = Readonly<{ tenantId: string; provider: AdsProvider; accountId: string }>;
export type AdsWindow = Readonly<{ since: string; until: string }>;
export type AdsReadPlan = Readonly<{ method: 'GET' | 'POST'; url: string; body?: Readonly<{ query: string; pageToken?: string }> }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[0-9]{1,32}$/;

export function normalizeAccount(provider: AdsProvider, value: string): string {
  if (provider === 'meta_ads') {
    const id = value.startsWith('act_') ? value.slice(4) : value;
    if (ID.test(id)) return 'act_' + id;
  } else if (provider === 'google_ads' && /^[0-9]{10}$/.test(value)) return value;
  throw new Error('ADS_ACCOUNT_INVALID');
}

/** Grants are derived exclusively from trusted server configuration; no account may be shared
 * by two tenants in this rollout. Do not accept grants from an HTTP body. */
export function assertAdsScope(scope: AdsScope, grants: readonly AdsScope[]) {
  if (!UUID.test(scope.tenantId) || normalizeAccount(scope.provider, scope.accountId) !== scope.accountId) throw new Error('ADS_SCOPE_DENIED');
  const matching = grants.filter(g => g.provider === scope.provider && g.accountId === scope.accountId);
  if (matching.length !== 1 || matching[0].tenantId !== scope.tenantId) throw new Error('ADS_SCOPE_DENIED');
}
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('ADS_DATE_INVALID');
  const d = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new Error('ADS_DATE_INVALID');
  return d.getTime();
}
export function assertAdsWindow(window: AdsWindow) {
  const span = (day(window.until) - day(window.since)) / 86_400_000;
  if (span < 0 || span >= 31) throw new Error('ADS_WINDOW_INVALID');
}
function cursorValue(cursor?: string) {
  if (cursor !== undefined && (cursor.length < 1 || cursor.length > 4096 || !/^[A-Za-z0-9_.~+\/=-]+$/.test(cursor))) throw new Error('ADS_CURSOR_INVALID');
  return cursor;
}
const META_LEVEL = { campaign: 'campaign', group: 'adset', ad: 'ad' } as const;
const GOOGLE_RESOURCE = { campaign: 'campaign', group: 'ad_group', ad: 'ad_group_ad' } as const;
const META_FIELDS = {
  campaign: 'account_id,account_currency,campaign_id,campaign_name,date_start,date_stop,impressions,clicks,spend',
  group: 'account_id,account_currency,campaign_id,campaign_name,adset_id,adset_name,date_start,date_stop,impressions,clicks,spend',
  ad: 'account_id,account_currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,impressions,clicks,spend',
} as const;
const GOOGLE_FIELDS = {
  campaign: 'customer.id, customer.currency_code, campaign.id, campaign.name, campaign.status',
  group: 'customer.id, customer.currency_code, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status',
  ad: 'customer.id, customer.currency_code, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status',
} as const;

export function buildAdsReadPlan(scope: AdsScope, grants: readonly AdsScope[], level: AdsLevel, window: AdsWindow, apiVersion: string, cursor?: string): AdsReadPlan {
  assertAdsScope(scope, grants);
  assertAdsWindow(window);
  if (!Object.prototype.hasOwnProperty.call(META_LEVEL, level)) throw new Error('ADS_LEVEL_INVALID');
  const token = cursorValue(cursor);
  if (scope.provider === 'meta_ads') {
    if (!/^v[1-9]\d?\.0$/.test(apiVersion)) throw new Error('ADS_VERSION_INVALID');
    const url = new URL('https://graph.facebook.com/' + apiVersion + '/' + scope.accountId + '/insights');
    url.searchParams.set('level', META_LEVEL[level]);
    url.searchParams.set('fields', META_FIELDS[level]);
    url.searchParams.set('time_range', JSON.stringify({ since: window.since, until: window.until }));
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('limit', '100');
    if (token) url.searchParams.set('after', token);
    return { method: 'GET', url: url.toString() };
  }
  if (!/^v[1-9]\d?$/.test(apiVersion)) throw new Error('ADS_VERSION_INVALID');
  const query = 'SELECT ' + GOOGLE_FIELDS[level] + ', segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ' + GOOGLE_RESOURCE[level] +
    " WHERE segments.date BETWEEN '" + window.since + "' AND '" + window.until + "'";
  return { method: 'POST', url: 'https://googleads.googleapis.com/' + apiVersion + '/customers/' + scope.accountId + '/googleAds:search', body: { query, ...(token ? { pageToken: token } : {}) } };
}
