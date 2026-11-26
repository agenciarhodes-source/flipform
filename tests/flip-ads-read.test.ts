import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdsReadPlan, type AdsScope } from '../lib/flip-ads/read-plan';
import { normalizeAdsPage } from '../lib/flip-ads/normalize';
import { campaignMetrics } from '../lib/flip-ads/metrics';

const tenantId = '12345678-1234-1234-1234-123456789abc';
const other = '22345678-1234-1234-1234-123456789abc';
const meta = { tenantId, provider: 'meta_ads', accountId: 'act_123456' } as const;
const google = { tenantId, provider: 'google_ads', accountId: '1234567890' } as const;
const grants: AdsScope[] = [meta,google];
const window = { since: '2026-11-01', until: '2026-11-01' };
const metaRow = { account_id:'123456', account_currency:'BRL', campaign_id:'1', campaign_name:'Synthetic', date_start:window.since, date_stop:window.until, impressions:'1000', clicks:'50', spend:'100.25' };
const googleRow = { customer:{ id:'1234567890',currencyCode:'BRL' }, campaign:{ id:'2',name:'Synthetic',status:'ENABLED' }, segments:{ date:window.since }, metrics:{ impressions:'1000',clicks:'50',costMicros:'100250000' } };

test('fixed read plans deny other tenant, shared account and arbitrary input', () => {
  const m = buildAdsReadPlan(meta,grants,'ad',window,'v27.0');
  assert.equal(m.method,'GET');
  assert.equal(new URL(m.url).hostname,'graph.facebook.com');
  assert.equal(new URL(m.url).searchParams.get('level'),'ad');
  const g = buildAdsReadPlan(google,grants,'group',window,'v26');
  assert.equal(g.method,'POST'); assert.ok(g.url.endsWith('/googleAds:search'));
  assert.ok(g.body?.query.includes('FROM ad_group WHERE'));
  assert.throws(() => buildAdsReadPlan({...meta,tenantId:other},grants,'ad',window,'v27.0'));
  assert.throws(() => buildAdsReadPlan(meta,[...grants,{...meta,tenantId:other}],'ad',window,'v27.0'));
  assert.throws(() => buildAdsReadPlan(google,grants,'campaign',{...window,until:"2026-11-01' OR 1=1"},'v26'));
  assert.throws(() => buildAdsReadPlan(meta,grants,'ad',window,'https://evil.test'));
  assert.throws(() => buildAdsReadPlan(meta,grants,'ad',window,'v27.0','https://evil.test'));
});
test('normalize both providers consistently without inventing metrics', () => {
  const m = normalizeAdsPage(meta,grants,'campaign',window,{data:[metaRow],paging:{next:'https://untrusted.test',cursors:{after:'opaque-token'}}});
  const g = normalizeAdsPage(google,grants,'campaign',window,{results:[googleRow]});
  assert.equal(m.nextCursor,'opaque-token');
  assert.equal(m.rows[0].spendMicros,g.rows[0].spendMicros);
  assert.equal(m.rows[0].clicks,g.rows[0].clicks);
  assert.equal(m.rows[0].status,null);
  assert.equal(g.rows[0].status,'ENABLED');
  assert.throws(() => normalizeAdsPage(meta,grants,'campaign',window,{data:[{...metaRow,account_id:'999'}]}));
  assert.throws(() => normalizeAdsPage(google,grants,'campaign',window,{results:[{...googleRow,metrics:{...googleRow.metrics,costMicros:'-1'}}]}));
  assert.throws(() => normalizeAdsPage(meta,grants,'campaign',window,{data:[metaRow,metaRow]}));
});
test('hierarchy preserves parent IDs and rejects incomplete rows', () => {
  const m = normalizeAdsPage(meta,grants,'ad',window,{data:[{...metaRow,adset_id:'3',ad_id:'4'}]});
  assert.equal(m.rows[0].groupId,'3'); assert.equal(m.rows[0].adId,'4');
  assert.throws(() => normalizeAdsPage(meta,grants,'ad',window,{data:[metaRow]}));
  const g = normalizeAdsPage(google,grants,'ad',window,{results:[{...googleRow,adGroup:{id:'3'},adGroupAd:{ad:{id:'4'},status:'PAUSED'}}]});
  assert.equal(g.rows[0].adId,'4'); assert.equal(g.rows[0].status,'PAUSED');
});
test('metrics avoid double counting and return null until CRM evidence exists', () => {
  const rows = normalizeAdsPage(meta,grants,'campaign',window,{data:[metaRow]}).rows;
  const m = campaignMetrics(rows)!;
  assert.equal(m.ctrPercent,5); assert.equal(m.cpc,2.005); assert.equal(m.cpl,null); assert.equal(m.cpa,null); assert.equal(m.roas,null);
  const outcomes = { ...meta, currency:'BRL', ...window, leads:10, contracts:2, revenueMicros:500_000_000 };
  assert.equal(campaignMetrics(rows,outcomes)?.cpl,10.025);
  assert.equal(campaignMetrics(rows,outcomes)?.cpa,50.125);
  assert.throws(() => campaignMetrics([...rows,...rows]));
  assert.throws(() => campaignMetrics(rows,{...outcomes,tenantId:other}));
  assert.throws(() => campaignMetrics(rows,{...outcomes,currency:'USD'}));
});
