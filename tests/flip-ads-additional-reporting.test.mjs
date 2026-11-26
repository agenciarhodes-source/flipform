import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatGPTAccountCheck, verifyChatGPTAccount, buildAdditionalAdsReadPlan, normalizeReportPage, deliveryMetrics } from '../lib/flip-ads/additional-reporting.mjs';
const tenantId="12345678-1234-1234-1234-123456789abc";
const other="22345678-1234-1234-1234-123456789abc";
const tt={"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"tiktok_ads","accountId":"123456789","connectionId":"fixture-tiktok","currency":"BRL","timezone":"America/Fortaleza"};
const oa={"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"chatgpt_ads","accountId":"adacct_fixture","connectionId":"fixture-openai","currency":"BRL","timezone":"America/Fortaleza"};
const grants=[{"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"tiktok_ads","accountId":"123456789","connectionId":"fixture-tiktok","currency":"BRL","timezone":"America/Fortaleza"},{"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"chatgpt_ads","accountId":"adacct_fixture","connectionId":"fixture-openai","currency":"BRL","timezone":"America/Fortaleza"}];
const window={"since":"2026-11-01","until":"2026-11-02"};
const ttRow={"dimensions":{"campaign_id":"123","stat_time_day":"2026-11-01"},"metrics":{"campaign_name":"Synthetic","impressions":"1000","clicks":"50","spend":"100.25"}};
const oaRow={"campaign_id":"cmpn_fixture","readable_time":"2026-11-01","campaign_name":"Synthetic","impressions":1000,"clicks":50,"spend":100.25};
function ttPage(rows=[ttRow],total=rows.length,page=1){return {code:0,data:{list:rows,page_info:{page,page_size:100,total_number:total,total_page:Math.ceil(total/100)},extra_info:{}}};}
function oaPage(rows=[oaRow],has_more=false,last_id="opaque:entity=cmpn_fixture"){return {object:"list",data:rows,count:rows.length,has_more,last_id};}
test("fixed endpoints and isolated grants", ()=>{
  const t=buildAdditionalAdsReadPlan(tt,grants,window),o=buildAdditionalAdsReadPlan(oa,grants,window);
  assert.equal(t.method,"GET");assert.ok(t.url.startsWith("https://business-api.tiktok.com/open_api/v2.0/report/integrated/get/?"));
  assert.ok(decodeURIComponent(t.url).includes('advertiser_ids=["123456789"]'));
  assert.ok(o.url.startsWith("https://api.ads.openai.com/v1/ad_account/insights?"));
  assert.equal(buildChatGPTAccountCheck(oa,grants).url,"https://api.ads.openai.com/v1/ad_account");
  assert.throws(()=>buildAdditionalAdsReadPlan({...tt,tenantId:other},grants,window));
  assert.throws(()=>buildAdditionalAdsReadPlan(tt,[...grants,{...tt,tenantId:other}],window));
  assert.throws(()=>buildAdditionalAdsReadPlan(tt,grants,{since:"2026-11-01",until:"2026-12-01"}));
 });
test("account metadata and connection provenance checked", ()=>{
  assert.equal(verifyChatGPTAccount(oa,grants,{id:oa.accountId,currency_code:"BRL",timezone:oa.timezone}).connectionId,oa.connectionId);
  assert.throws(()=>verifyChatGPTAccount(oa,grants,{id:"adacct_other",currency_code:"BRL",timezone:oa.timezone}));
  assert.throws(()=>normalizeReportPage(oa,grants,window,tt,oaPage()));
  assert.throws(()=>normalizeReportPage(tt,grants,window,{...tt,connectionId:"fixture-other"},ttPage()));
 });
test("normalized delivery and no inferred conversions", ()=>{
  const t=normalizeReportPage(tt,grants,window,tt,ttPage()),o=normalizeReportPage(oa,grants,window,oa,oaPage());
  assert.equal(t.rows[0].spendMicros,100250000);assert.equal(o.rows[0].spendMicros,t.rows[0].spendMicros);
  assert.equal(deliveryMetrics(t.rows).ctrPercent,5);assert.equal(deliveryMetrics(o.rows).cpc,2.005);
  assert.equal(deliveryMetrics(o.rows).roas,null);assert.equal(t.coverage,"unverified");
  assert.throws(()=>deliveryMetrics([...t.rows,...o.rows]));
  assert.throws(()=>deliveryMetrics([...t.rows,...t.rows]));
 });
test("null metrics and malformed responses fail safely", ()=>{
  const o=normalizeReportPage(oa,grants,window,oa,oaPage([{...oaRow,spend:null,clicks:null}]));
  assert.equal(deliveryMetrics(o.rows).spendMicros,null);assert.equal(deliveryMetrics(o.rows).cpc,null);
  assert.throws(()=>normalizeReportPage(oa,grants,window,oa,oaPage([{...oaRow,spend:-1}])));
  assert.throws(()=>normalizeReportPage(oa,grants,window,oa,oaPage([oaRow,oaRow])));
  assert.throws(()=>normalizeReportPage(tt,grants,window,tt,{code:1}));
  const partial=ttPage();partial.data.extra_info={search_ads_throttle:"truncated"};assert.throws(()=>normalizeReportPage(tt,grants,window,tt,partial));
 });
test("pagination bound to account, window and connection", ()=>{
  const o=normalizeReportPage(oa,grants,window,oa,oaPage([oaRow],true));
  assert.equal(o.pageExhausted,false);assert.ok(decodeURIComponent(buildAdditionalAdsReadPlan(oa,grants,window,o.nextCursor).url).includes("after=opaque:entity=cmpn_fixture"));
  assert.throws(()=>buildAdditionalAdsReadPlan(tt,grants,window,o.nextCursor));
  assert.throws(()=>buildAdditionalAdsReadPlan(oa,grants,{...window,until:"2026-11-03"},o.nextCursor));
  assert.throws(()=>normalizeReportPage(oa,grants,window,oa,oaPage([oaRow],true),o.nextCursor));
  const many=Array.from({length:100},(_,i)=>({...ttRow,dimensions:{...ttRow.dimensions,campaign_id:String(1000+i)}}));
  const t=normalizeReportPage(tt,grants,window,tt,ttPage(many,101));
  assert.equal(t.nextCursor.value,2);assert.ok(decodeURIComponent(buildAdditionalAdsReadPlan(tt,grants,window,t.nextCursor).url).includes("page=2"));
  assert.throws(()=>normalizeReportPage(tt,grants,window,tt,ttPage(many,101),t.nextCursor));
  assert.equal(normalizeReportPage(tt,grants,window,tt,ttPage([ttRow],101,2),t.nextCursor).pageExhausted,true);
 });
