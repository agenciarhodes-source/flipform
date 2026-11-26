import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveBriefing, selectGroundedRecommendations } from '../lib/flip-intelligence/executive-advice.mjs';
import { buildIntelligenceSnapshot, intelligenceSourceKey } from '../lib/flip-intelligence/executive-snapshot.mjs';
const t="12345678-1234-1234-1234-123456789abc";
const other="22345678-1234-1234-1234-123456789abc";
const now="2026-11-07T12:00:00.000Z";
const w={"since":"2026-11-04","until":"2026-11-06"};
const prev={"since":"2026-11-01","until":"2026-11-03"};
const actor={"tenantId":"12345678-1234-1234-1234-123456789abc","userId":"32345678-1234-1234-1234-123456789abc","mode":"fixture","role":"owner","membership":"active","tenantStatus":"active","mfaVerified":true,"executiveRead":true,"domains":["commercial","finance","marketing"]};
function snapshot(window,orders){
 const specs={orders:["commercial","count"],won_opportunities:["commercial","count"],closed_opportunities:["commercial","count"],order_value_minor:["commercial","money_minor"],receivables_due_minor:["finance","money_minor"],payables_due_minor:["finance","money_minor"],ads_impressions:["marketing","count"],ads_clicks:["marketing","count"],ads_spend_micros:["marketing","money_micros"],search_clicks:["marketing","count"],search_impressions:["marketing","count"]};
 const metrics=Object.fromEntries(Object.entries(specs).map(([n,[domain,unit]])=>[n,{domain,unit,value:null,reason:"no_source",sourceKey:null,observedAt:null,dayBasis:null,currency:null}]));
 metrics.orders={domain:"commercial",unit:"count",value:orders,reason:null,sourceKey:JSON.stringify([t,"order","fixture_erp","fixture-connection","private-account","America/Fortaleza","BRL"]),observedAt:now,dayBasis:"America/Fortaleza",currency:null};
 return {version:1,tenantId:t,mode:"fixture",productionReady:false,window,asOf:now,metrics};
}
test("facts, comparisons and review-only recommendations are grounded", ()=>{const a=buildExecutiveBriefing(actor,snapshot(w,5),snapshot(prev,10),now);assert.equal(a.facts.length,2);assert.equal(a.observations[0].changePercent,-50);assert.equal(a.recommendations[0].metric,"orders");assert.equal(a.recommendations[0].execution,"disabled");assert.equal(a.actionsEnabled,false);assert.equal(a.externalModelEnabled,false);assert.equal(a.forecast,null);assert.ok(!JSON.stringify(a).includes("private-account"));});
test("deny other tenant, disabled access, admin, missing MFA or live context", ()=>{for(const change of [{tenantId:other},{role:"admin"},{mfaVerified:false},{executiveRead:false},{membership:"inactive"},{mode:"live"}])assert.throws(()=>buildExecutiveBriefing({...actor,...change},snapshot(w,5),null,now));assert.throws(()=>buildExecutiveBriefing(actor,{...snapshot(w,5),tenantId:other},null,now));assert.throws(()=>buildExecutiveBriefing(actor,{...snapshot(w,5),productionReady:true},null,now));});
test("domain authorization prevents unauthorized financial facts or gaps", ()=>{const a=buildExecutiveBriefing({...actor,domains:["commercial"]},snapshot(w,5),null,now);assert.ok(a.facts.every(x=>x.domain==="commercial"));assert.ok(a.gaps.every(x=>x.domain==="commercial"));assert.equal(a.recommendations.length,0);});
test("no trend across mismatched periods, sources, missing or zero denominator", ()=>{const s=snapshot(prev,10);s.metrics.orders.sourceKey=JSON.stringify([t,"order","fixture_erp","different","private-account","America/Fortaleza","BRL"]);assert.equal(buildExecutiveBriefing(actor,snapshot(w,5),s,now).recommendations.length,0);const zero=buildExecutiveBriefing(actor,snapshot(w,5),snapshot(prev,0),now);assert.equal(zero.observations[0].changePercent,null);assert.equal(zero.recommendations.length,0);assert.throws(()=>buildExecutiveBriefing(actor,snapshot(w,5),snapshot(w,10),now));});
test("stale, foreign or malformed evidence fails closed", ()=>{const s=snapshot(w,5);s.metrics.orders.sourceKey=JSON.stringify([other,"order","fixture_erp","fixture-connection","private-account","America/Fortaleza","BRL"]);assert.throws(()=>buildExecutiveBriefing(actor,s,null,now));assert.throws(()=>buildExecutiveBriefing(actor,snapshot(w,5),null,"2026-11-10T12:00:00.000Z"));const m=snapshot(w,5);m.metrics.orders.value=-1;assert.throws(()=>buildExecutiveBriefing(actor,m,null,now));});
test("strict selection only accepts existing recommendations without model free text", ()=>{const a=buildExecutiveBriefing(actor,snapshot(w,5),snapshot(prev,10),now);assert.equal(selectGroundedRecommendations(a,[{metric:"orders"}])[0].metric,"orders");for(const selection of [[{metric:"orders",text:"invented"}],[{metric:"orders"},{metric:"orders"}],[{metric:"ads_clicks"}],[{tool:"publish_campaign"}]])assert.throws(()=>selectGroundedRecommendations(a,selection));});
test('PR-I real module contract feeds PR-J synthetic briefing',()=>{
 const g={tenantId:t,kind:'order',providerId:'fixture_erp',connectionId:'fixture-connection',accountId:'private-account',environment:'fixture',dayBasis:'America/Fortaleza',currency:'BRL'};
 const make=(window,n)=>buildIntelligenceSnapshot({tenantId:t,mode:'fixture',window,asOf:now,sources:[{grant:g,window,coverage:'fixture_complete',observedAt:now,rows:Array.from({length:n},(_,i)=>({...g,sourceId:'order-'+i,status:'confirmed',orderDate:window.since,orderTotal:{currency:'BRL',amountMinor:100}}))}],selection:[{metric:'orders',sourceKey:intelligenceSourceKey(g)}]});
 const b=buildExecutiveBriefing(actor,make(w,5),make(prev,10),now);
 assert.equal(b.recommendations[0].metric,'orders');
 assert.equal(b.observations[0].changePercent,-50);
});
