import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoogleOrganicPlan, normalizeGoogleOrganic, summarizeSearchDaily } from '../lib/flip-intelligence/google-organic-reporting.mjs';
const tenantId="12345678-1234-1234-1234-123456789abc";
const other="22345678-1234-1234-1234-123456789abc";
const gb={"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"google_business_profile","resourceId":"locations/123","accountId":"accounts/456","connectionId":"fixture-gbp"};
const yt={"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"youtube_analytics","resourceId":"UCAAAAAAAAAAAAAAAAAAAAAA","connectionId":"fixture-youtube"};
const sc={"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"google_search_console","resourceId":"sc-domain:example.com","connectionId":"fixture-search"};
const grants=[{"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"google_business_profile","resourceId":"locations/123","accountId":"accounts/456","connectionId":"fixture-gbp"},{"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"youtube_analytics","resourceId":"UCAAAAAAAAAAAAAAAAAAAAAA","connectionId":"fixture-youtube"},{"tenantId":"12345678-1234-1234-1234-123456789abc","provider":"google_search_console","resourceId":"sc-domain:example.com","connectionId":"fixture-search"}];
const w={"since":"2026-11-01","until":"2026-11-03"};
const gbPayload={"multiDailyMetricTimeSeries":[{"dailyMetricTimeSeries":[{"dailyMetric":"CALL_CLICKS","timeSeries":{"datedValues":[{"date":{"year":2026,"month":11,"day":1},"value":"4"},{"date":{"year":2026,"month":11,"day":2}}]}}]}]};
const ytPayload={"columnHeaders":[{"name":"day","columnType":"DIMENSION"},{"name":"views","columnType":"METRIC"},{"name":"estimatedMinutesWatched","columnType":"METRIC"},{"name":"subscribersGained","columnType":"METRIC"},{"name":"subscribersLost","columnType":"METRIC"}],"rows":[["2026-11-01",100,200,4,1]]};
const scPayload={"responseAggregationType":"byProperty","rows":[{"keys":["2026-11-01"],"clicks":10,"impressions":100,"ctr":0.1,"position":5},{"keys":["2026-11-02"],"clicks":10,"impressions":50,"ctr":0.2,"position":8}]};
function receipt(s,k,window){const p=buildGoogleOrganicPlan(s,grants,k,window);return {connectionId:p.connectionId,reportKey:p.reportKey};}
test("fixed Google endpoints, scopes and read-only query bodies", ()=>{
 const g=buildGoogleOrganicPlan(gb,grants,"daily",w),y=buildGoogleOrganicPlan(yt,grants,"daily",w),s=buildGoogleOrganicPlan(sc,grants,"daily",w);
 assert.ok(g.url.startsWith("https://businessprofileperformance.googleapis.com/v1/locations/123:"));
 assert.ok(g.url.includes("dailyRange.start_date.year=2026"));assert.equal(g.method,"GET");
 assert.ok(decodeURIComponent(y.url).includes("ids=channel=="+yt.resourceId));
 assert.equal(s.method,"POST");assert.equal(s.body.dataState,"final");assert.equal(s.body.aggregationType,"byProperty");assert.equal(s.body.dimensions[0],"date");
 assert.equal(buildGoogleOrganicPlan(sc,grants,"top_queries",w).body.rowLimit,250);
 assert.ok(buildGoogleOrganicPlan(gb,grants,"reviews",null).url.includes("fields=averageRating%2CtotalReviewCount"));
});
test("tenant, exact resource, connection and report binding", ()=>{
 assert.throws(()=>buildGoogleOrganicPlan({...gb,tenantId:other},grants,"daily",w));
 assert.throws(()=>buildGoogleOrganicPlan(sc,[...grants,{...sc,tenantId:other}],"daily",w));
 assert.throws(()=>buildGoogleOrganicPlan({...sc,resourceId:"https://evil.example/?x"},grants,"daily",w));
 assert.throws(()=>buildGoogleOrganicPlan(gb,grants,"top_queries",w));
 assert.throws(()=>buildGoogleOrganicPlan(yt,grants,"daily",{since:"2026-02-30",until:"2026-03-03"}));
 assert.throws(()=>buildGoogleOrganicPlan(yt,grants,"daily",{since:"2026-11-01",until:"2026-12-02"}));
 assert.throws(()=>normalizeGoogleOrganic(yt,grants,"daily",w,receipt(gb,"daily",w),ytPayload));
 assert.throws(()=>normalizeGoogleOrganic(sc,grants,"top_queries",w,receipt(sc,"daily",w),scPayload));
});
test("business profile zero vs missing day, review summary without PII", ()=>{
 const a=normalizeGoogleOrganic(gb,grants,"daily",w,receipt(gb,"daily",w),gbPayload);
 assert.equal(a.rows.length,2);assert.equal(a.rows[1].value,0);assert.equal(a.rows[0].value,4);
 const b=normalizeGoogleOrganic(gb,grants,"reviews",null,receipt(gb,"reviews",null),{totalReviewCount:12,averageRating:4.5,reviews:[{reviewer:{displayName:"Fixture private name"},comment:"private text"}]});
 assert.equal(b.rows[0].averageRating,4.5);assert.ok(!JSON.stringify(b).includes("private"));
 assert.throws(()=>normalizeGoogleOrganic(gb,grants,"reviews",null,receipt(gb,"reviews",null),{totalReviewCount:12,averageRating:8}));
 assert.throws(()=>normalizeGoogleOrganic(gb,grants,"daily",w,receipt(gb,"daily",w),{multiDailyMetricTimeSeries:[...gbPayload.multiDailyMetricTimeSeries,...gbPayload.multiDailyMetricTimeSeries]}));
});
test("YouTube named headers, native dates and duplicate rejection", ()=>{
 const a=normalizeGoogleOrganic(yt,grants,"daily",w,receipt(yt,"daily",w),ytPayload);
 assert.equal(a.rows[0].views,100);assert.equal(a.rows[0].subscribersLost,1);assert.equal(a.dayBasis,"America/Los_Angeles");
 assert.throws(()=>normalizeGoogleOrganic(yt,grants,"daily",w,receipt(yt,"daily",w),{...ytPayload,columnHeaders:[...ytPayload.columnHeaders].reverse()}));
 assert.throws(()=>normalizeGoogleOrganic(yt,grants,"daily",w,receipt(yt,"daily",w),{...ytPayload,rows:[...ytPayload.rows,...ytPayload.rows]}));
});
test("Search Console weighted position, CTR and top-query isolation", ()=>{
 const a=normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),scPayload),s=summarizeSearchDaily(a);
 assert.equal(s.clicks,20);assert.equal(s.impressions,150);assert.equal(s.ctr,20/150);assert.equal(s.averagePosition,6);assert.equal(s.observedDays,2);
 const q=normalizeGoogleOrganic(sc,grants,"top_queries",w,receipt(sc,"top_queries",w),{responseAggregationType:"byProperty",rows:[{keys:["fixture search"],clicks:1,impressions:2,ctr:0.5,position:2}]});
 assert.equal(q.coverage,"top_only");assert.throws(()=>summarizeSearchDaily(q));
 assert.throws(()=>normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),{...scPayload,responseAggregationType:"byPage"}));
 assert.throws(()=>normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),{...scPayload,metadata:{first_incomplete_date:"2026-11-02"}}));
});
test("malformed payloads, provider errors and unknown coverage", ()=>{
 assert.throws(()=>normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),{error:{code:403}}));
 assert.throws(()=>normalizeGoogleOrganic(yt,grants,"daily",w,receipt(yt,"daily",w),{...ytPayload,rows:[["2026-11-04",100,200,4,1]]}));
 assert.throws(()=>normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),{...scPayload,rows:[{keys:["2026-11-01"],clicks:10,impressions:100,ctr:0.5,position:3}]}));
 const a=normalizeGoogleOrganic(sc,grants,"daily",w,receipt(sc,"daily",w),{responseAggregationType:"byProperty"});
 assert.equal(a.coverage,"unverified");assert.equal(summarizeSearchDaily(a).ctr,null);
});
