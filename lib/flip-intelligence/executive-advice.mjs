/** PR-J — fixture-only executive decision support. No external AI or actions. */
const CATALOG={"orders":["commercial","count","Pedidos confirmados ou concluídos"],"won_opportunities":["commercial","count","Oportunidades ganhas"],"closed_opportunities":["commercial","count","Oportunidades encerradas"],"order_value_minor":["commercial","money_minor","Valor de pedidos confirmados ou concluídos"],"receivables_due_minor":["finance","money_minor","Contas a receber abertas ou vencidas no período de vencimento"],"payables_due_minor":["finance","money_minor","Contas a pagar abertas ou vencidas no período de vencimento"],"ads_impressions":["marketing","count","Impressões de publicidade"],"ads_clicks":["marketing","count","Cliques de publicidade"],"ads_spend_micros":["marketing","money_micros","Gasto de publicidade"],"search_clicks":["marketing","count","Cliques de busca orgânica"],"search_impressions":["marketing","count","Impressões de busca orgânica"]};
const RULES={"orders":{"down":"Revisar pedidos confirmados e concluídos e investigar a queda."},"won_opportunities":{"down":"Revisar as oportunidades encerradas e os motivos de perda."},"order_value_minor":{"down":"Investigar a redução no valor dos pedidos; esse valor não representa receita realizada."},"receivables_due_minor":{"up":"Revisar contas abertas ou vencidas e conferir a conciliação com o financeiro."},"payables_due_minor":{"up":"Revisar vencimentos e compromissos com o financeiro; não presumir insuficiência de caixa."},"ads_clicks":{"down":"Revisar desempenho das campanhas e segmentação antes de propor qualquer alteração."},"ads_impressions":{"down":"Revisar a distribuição dos anúncios; não presumir queda de vendas."},"ads_spend_micros":{"up":"Conferir o gasto e a qualidade dos resultados antes de propor mudança de orçamento."},"search_clicks":{"down":"Investigar páginas e termos de busca com queda de cliques."},"search_impressions":{"down":"Revisar visibilidade orgânica e possíveis mudanças nas páginas."}};
function fail(code){throw Error(code);}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function uuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);}

function day(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail("EXEC_DATE_INVALID");const t=Date.parse(v+"T00:00:00Z");if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==v)fail("EXEC_DATE_INVALID");return t;}

function stamp(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail("EXEC_TIME_INVALID");return Date.parse(v);}

function windowLength(w){const days=(day(w?.until)-day(w?.since))/86400000+1;if(days<1||days>31)fail("EXEC_PERIOD_INVALID");return days;}

function authorized(actor){
 // Caller must construct this from an independently verified server session and membership.
 // This fixture-only module does NOT authenticate a real session or enforce a live entitlement.
 if(!actor||!uuid(actor.tenantId)||!uuid(actor.userId)||actor.mode!=="fixture"||actor.role!=="owner"||actor.membership!=="active"||actor.tenantStatus!=="active"||actor.mfaVerified!==true||actor.executiveRead!==true||!Array.isArray(actor.domains)||actor.domains.length>3||new Set(actor.domains).size!==actor.domains.length||!actor.domains.every(d=>["commercial","finance","marketing"].includes(d)))fail("EXEC_ACCESS_DENIED");
 return new Set(actor.domains);
}

function sourceParts(value,t,domain,metric){
 if(typeof value!=="string"||value.length>1024)fail("EXEC_SOURCE_INVALID");
 let p;try{p=JSON.parse(value);}catch{fail("EXEC_SOURCE_INVALID");}
 if(!Array.isArray(p)||p.length!==7||p[0]!==t)fail("EXEC_SOURCE_INVALID");
 const expected={orders:"order",won_opportunities:"crm_opportunity",closed_opportunities:"crm_opportunity",order_value_minor:"order",receivables_due_minor:"receivable",payables_due_minor:"payable",ads_impressions:"ads",ads_clicks:"ads",ads_spend_micros:"ads",search_clicks:"search",search_impressions:"search"}[metric];
 if(p[1]!==expected||![p[2],p[3],p[4]].every(v=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v))||typeof p[5]!=="string"||p[5].length>80||![null,"BRL","USD","EUR"].includes(p[6]))fail("EXEC_SOURCE_INVALID");
 try{new Intl.DateTimeFormat("en-US",{timeZone:p[5]});}catch{fail("EXEC_SOURCE_INVALID");}
 return p;
}

function validateSnapshot(actor,s,now,domains){
 if(!s||s.version!==1||s.mode!=="fixture"||s.productionReady!==false||s.tenantId!==actor.tenantId)fail("EXEC_SNAPSHOT_DENIED");
 windowLength(s.window);
 const asOf=stamp(s.asOf);
 if(asOf>now||now-asOf>48*3600000||s.window.until>s.asOf.slice(0,10))fail("EXEC_SNAPSHOT_STALE");
 if(!s.metrics||typeof s.metrics!=="object"||Array.isArray(s.metrics)||Object.keys(s.metrics).some(k=>!own(CATALOG,k)))fail("EXEC_METRICS_INVALID");
 const valid={};
 for(const [name,[domain,unit,label]] of Object.entries(CATALOG)){
  if(!domains.has(domain))continue;
  const m=s.metrics[name];
  if(!m||m.domain!==domain||m.unit!==unit)fail("EXEC_METRICS_INVALID");
  if(m.value===null){
   if(!["no_source","coverage_unverified","stale","missing_or_unknown_value"].includes(m.reason))fail("EXEC_METRICS_INVALID");
   valid[name]={name,domain,unit,label,value:null,reason:m.reason};
   continue;
  }
  if(m.reason!==null||!Number.isSafeInteger(m.value)||m.value<0)fail("EXEC_METRICS_INVALID");
  const parts=sourceParts(m.sourceKey,actor.tenantId,domain,name);
  const observed=stamp(m.observedAt);
  if(observed>asOf||now-observed>48*3600000||parts[5]!==m.dayBasis)fail("EXEC_METRICS_STALE");
  const isMoney=unit.startsWith("money");
  if(isMoney?(!["BRL","USD","EUR"].includes(m.currency)||parts[6]!==m.currency):m.currency!==null)fail("EXEC_CURRENCY_INVALID");
  valid[name]={name,domain,unit,label,value:m.value,reason:null,sourceKey:m.sourceKey,observedAt:m.observedAt,dayBasis:m.dayBasis,currency:m.currency};
 }
 return valid;
}

export function buildExecutiveBriefing(actor,current,previous=null,nowISO,thresholdPercent=20){
 const domains=authorized(actor),now=stamp(nowISO);
 if(typeof thresholdPercent!=="number"||!Number.isFinite(thresholdPercent)||thresholdPercent<5||thresholdPercent>100)fail("EXEC_THRESHOLD_INVALID");
 const c=validateSnapshot(actor,current,now,domains);
 let p=null;
 if(previous!==null){
  p=validateSnapshot(actor,previous,now,domains);
  if(windowLength(previous.window)!==windowLength(current.window)||day(previous.window.until)+86400000!==day(current.window.since))fail("EXEC_PERIOD_INVALID");
 }
 const facts=[],gaps=[],observations=[],recommendations=[];
 for(const [name,m] of Object.entries(c)){
  if(m.value===null){gaps.push({metric:name,domain:m.domain,reason:m.reason});continue;}
  const evidenceId="current:"+name;
  // Fixed projection; no raw provider fields, source identifiers, account IDs, or user-supplied text.
  facts.push({id:evidenceId,kind:"fact",metric:name,domain:m.domain,label:m.label,value:m.value,unit:m.unit,currency:m.currency,dayBasis:m.dayBasis,observedAt:m.observedAt,period:{since:current.window.since,until:current.window.until}});
  const b=p?.[name];
  if(!b||b.value===null||b.sourceKey!==m.sourceKey||b.dayBasis!==m.dayBasis||b.unit!==m.unit||b.currency!==m.currency)continue;
  const previousId="previous:"+name;
  facts.push({id:previousId,kind:"fact",metric:name,domain:m.domain,label:m.label,value:b.value,unit:b.unit,currency:b.currency,dayBasis:b.dayBasis,observedAt:b.observedAt,period:{since:previous.window.since,until:previous.window.until}});
  const delta=m.value-b.value,pct=b.value===0?null:delta/b.value*100;
  const observationId="change:"+name;
  observations.push({id:observationId,kind:"calculated_comparison",metric:name,domain:m.domain,delta,changePercent:pct,evidence:[evidenceId,previousId]});
  const rule=own(RULES,name)?RULES[name][delta>0?"up":"down"]:null;
  if(rule&&delta!==0&&pct!==null&&Math.abs(pct)>=thresholdPercent)recommendations.push({kind:"recommendation",metric:name,domain:m.domain,text:rule,evidence:[evidenceId,previousId],observationId,requiresHumanReview:true,execution:"disabled"});
 }
 return {version:1,mode:"fixture",productionReady:false,notice:"Demonstração com dados sintéticos. Não representa uma empresa real.",period:{since:current.window.since,until:current.window.until},facts,gaps,observations,recommendations,forecast:null,actionsEnabled:false,externalModelEnabled:false};
}

export function selectGroundedRecommendations(briefing,selection){
 if(!briefing||briefing.version!==1||briefing.mode!=="fixture"||briefing.actionsEnabled!==false||!Array.isArray(briefing.recommendations)||!Array.isArray(selection)||selection.length>10)fail("EXEC_SELECTION_INVALID");
 const seen=new Set();
 return selection.map(s=>{
  if(!s||typeof s!=="object"||Array.isArray(s)||Object.keys(s).length!==1||!own(s,"metric")||typeof s.metric!=="string"||seen.has(s.metric))fail("EXEC_SELECTION_INVALID");
  const r=briefing.recommendations.filter(x=>x.metric===s.metric);
  if(r.length!==1||r[0].requiresHumanReview!==true||r[0].execution!=="disabled")fail("EXEC_SELECTION_INVALID");
  seen.add(s.metric);
  return r[0];
 });
}
