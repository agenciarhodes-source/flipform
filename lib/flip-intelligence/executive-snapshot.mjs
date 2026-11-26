/** PR-I: synthetic executive analytics; never expose as live data. */
const METRICS={"orders":{"domain":"commercial","unit":"count","kind":"order"},"won_opportunities":{"domain":"commercial","unit":"count","kind":"crm_opportunity"},"closed_opportunities":{"domain":"commercial","unit":"count","kind":"crm_opportunity"},"order_value_minor":{"domain":"commercial","unit":"money_minor","kind":"order"},"receivables_due_minor":{"domain":"finance","unit":"money_minor","kind":"receivable"},"payables_due_minor":{"domain":"finance","unit":"money_minor","kind":"payable"},"ads_impressions":{"domain":"marketing","unit":"count","kind":"ads"},"ads_clicks":{"domain":"marketing","unit":"count","kind":"ads"},"ads_spend_micros":{"domain":"marketing","unit":"money_micros","kind":"ads"},"search_clicks":{"domain":"marketing","unit":"count","kind":"search"},"search_impressions":{"domain":"marketing","unit":"count","kind":"search"}};
function fail(code){throw Error(code);}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function id(v){if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v))fail("INTELLIGENCE_ID_INVALID");return v;}

function day(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail("INTELLIGENCE_DATE_INVALID");const t=Date.parse(v+"T00:00:00Z");if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==v)fail("INTELLIGENCE_DATE_INVALID");return t;}

function period(w){if(!w)fail("INTELLIGENCE_WINDOW_INVALID");const s=day(w.since),u=day(w.until),n=(u-s)/86400000+1;if(n<1||n>31)fail("INTELLIGENCE_WINDOW_INVALID");return n;}

function stamp(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail("INTELLIGENCE_TIMESTAMP_INVALID");return v;}

function count(v){if(!Number.isSafeInteger(v)||v<0)fail("INTELLIGENCE_NUMBER_INVALID");return v;}

function add(a,b){return count(a+count(b));}

function tenant(v){if(typeof v!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v))fail("INTELLIGENCE_SCOPE_DENIED");return v;}

function currency(v){if(!["BRL","USD","EUR"].includes(v))fail("INTELLIGENCE_CURRENCY_INVALID");return v;}

function timezone(v){if(typeof v!=="string"||v.length>80)fail("INTELLIGENCE_TIMEZONE_INVALID");try{new Intl.DateTimeFormat("en-US",{timeZone:v});}catch{fail("INTELLIGENCE_TIMEZONE_INVALID");}return v;}

function within(d,w){day(d);return d>=w.since&&d<=w.until;}

function sourceKey(g){return JSON.stringify([g.tenantId,g.kind,g.providerId,g.connectionId,g.accountId,g.dayBasis,g.currency??null]);}

function checkedSource(tenantId,g){
 if(!g||g.tenantId!==tenantId||g.environment!=="fixture"||!["order","crm_opportunity","receivable","payable","ads","search"].includes(g.kind))fail("INTELLIGENCE_FIXTURE_ONLY");
 id(g.providerId);id(g.connectionId);id(g.accountId);timezone(g.dayBasis);
 if(g.kind!=="crm_opportunity"&&g.kind!=="search")currency(g.currency);
 else if(g.currency!=null)currency(g.currency);
 return g;
}

function metricValue(metric,g,rows,w){
 const spec=METRICS[metric],seen=new Set();let sum=0,missing=false;
 for(const r of rows){
  if(!r||r.tenantId!==g.tenantId||r.kind!==g.kind||r.connectionId!==g.connectionId||r.providerId!==g.providerId||r.accountId!==g.accountId||r.environment!=="fixture")fail("INTELLIGENCE_SCOPE_DENIED");
  const key=id(r.sourceId);if(seen.has(key))fail("INTELLIGENCE_DUPLICATE");seen.add(key);
  let v=null,include=false;
  if(g.kind==="order"){
   if(!["pending","confirmed","fulfilled","cancelled","unknown"].includes(r.status))fail("INTELLIGENCE_STATUS_INVALID");
   include=within(r.orderDate,w)&&["confirmed","fulfilled"].includes(r.status);
   if(within(r.orderDate,w)&&r.status==="unknown")missing=true;
   v=metric==="orders"?1:r.orderTotal?.amountMinor??null;
   if(metric==="order_value_minor"&&r.orderTotal!=null&&r.orderTotal.currency!==g.currency)fail("INTELLIGENCE_CURRENCY_INVALID");
  }else if(g.kind==="crm_opportunity"){
   if(!["open","won","lost","unknown"].includes(r.status))fail("INTELLIGENCE_STATUS_INVALID");
   if(r.closedDate!=null)day(r.closedDate);
   if((r.status==="won"||r.status==="lost")!==(r.closedDate!=null))fail("INTELLIGENCE_STATUS_INVALID");
   if(r.status==="unknown")missing=true;
   include=r.closedDate!=null&&within(r.closedDate,w)&&(metric==="closed_opportunities"||r.status==="won");
   v=1;
  }else if(g.kind==="receivable"||g.kind==="payable"){
   const states=g.kind==="receivable"?["open","overdue","confirmed","received","refunded","cancelled","unknown"]:["open","overdue","paid","cancelled","unknown"];
   if(!states.includes(r.status))fail("INTELLIGENCE_STATUS_INVALID");
   include=within(r.dueDate,w)&&["open","overdue"].includes(r.status);
   if(within(r.dueDate,w)&&r.status==="unknown")missing=true;
   if(r.faceValue!=null&&r.faceValue.currency!==g.currency)fail("INTELLIGENCE_CURRENCY_INVALID");
   v=r.faceValue?.amountMinor??null;
  }else{
   include=within(r.date,w);
   if(g.kind==="ads"&&r.currency!==g.currency)fail("INTELLIGENCE_CURRENCY_INVALID");
   if(g.kind==="ads"&&r.level!=="campaign")fail("INTELLIGENCE_GRAIN_INVALID");
   const field={ads_clicks:"clicks",ads_impressions:"impressions",ads_spend_micros:"spendMicros",search_clicks:"clicks",search_impressions:"impressions"}[metric];
   v=r[field]??null;
  }
  if(include){if(v===null)missing=true;else sum=add(sum,v);}
 }
 return missing?null:sum;
}

export function buildIntelligenceSnapshot(input){
 const t=tenant(input?.tenantId),w=input.window;period(w);const asOf=stamp(input.asOf);
 if(w.until>asOf.slice(0,10))fail("INTELLIGENCE_FUTURE_WINDOW");
 if(input.mode!=="fixture"||!Array.isArray(input.sources)||input.sources.length>20||!Array.isArray(input.selection)||input.selection.length>Object.keys(METRICS).length)fail("INTELLIGENCE_FIXTURE_ONLY");
 const byKey=new Map(),metricSelection=new Map(),accounts=new Set(),sourceGroups=new Set();
 for(const s of input.sources){
  const g=checkedSource(t,s?.grant),key=sourceKey(g),account=JSON.stringify([g.kind,g.providerId,g.accountId]),group=JSON.stringify([g.kind,g.connectionId]);
  if(byKey.has(key)||accounts.has(account)||sourceGroups.has(group)||!Array.isArray(s.rows)||s.rows.length>10000)fail("INTELLIGENCE_SOURCE_INVALID");
  accounts.add(account);sourceGroups.add(group);
  if(s.coverage!=="fixture_complete"&&s.coverage!=="unverified")fail("INTELLIGENCE_COVERAGE_INVALID");
  const observedAt=stamp(s.observedAt);
  if(observedAt>asOf)fail("INTELLIGENCE_TIMESTAMP_INVALID");
  for(const r of s.rows)if(!r||r.tenantId!==t||r.connectionId!==g.connectionId||r.providerId!==g.providerId||r.accountId!==g.accountId||r.kind!==g.kind||r.environment!=="fixture")fail("INTELLIGENCE_SCOPE_DENIED");
  byKey.set(key,{...s,grant:g,observedAt});
 }
 for(const sel of input.selection){
  if(!sel||!own(METRICS,sel.metric)||metricSelection.has(sel.metric))fail("INTELLIGENCE_SELECTION_INVALID");
  const source=byKey.get(sel.sourceKey);
  if(!source||source.grant.kind!==METRICS[sel.metric].kind)fail("INTELLIGENCE_SELECTION_INVALID");
  metricSelection.set(sel.metric,source);
 }
 const metrics={};
 for(const [name,spec] of Object.entries(METRICS)){
  const s=metricSelection.get(name),g=s?.grant;
  let value=null,reason="no_source";
  if(s){
   // The manifest must attest the exact entire window; never infer completeness from rows or page exhaustion.
   const complete=s.coverage==="fixture_complete"&&s.window?.since===w.since&&s.window?.until===w.until;
   const fresh=(Date.parse(asOf)-Date.parse(s.observedAt))<=48*3600000;
   if(!complete)reason="coverage_unverified";
   else if(!fresh)reason="stale";
   else {value=metricValue(name,g,s.rows,w);reason=value===null?"missing_or_unknown_value":null;}
  }
  metrics[name]={domain:spec.domain,unit:spec.unit,value,reason,sourceKey:g?sourceKey(g):null,observedAt:s?.observedAt??null,dayBasis:g?.dayBasis??null,currency:spec.unit.startsWith("money")?g?.currency??null:null};
 }
 function ratio(a,b,scale,unit){
  const x=metrics[a],y=metrics[b];
  if(x.value===null||y.value===null||x.sourceKey!==y.sourceKey||y.value===0)return {value:null,unit,reason:"incomplete_or_incompatible",sourceKey:null};
  if((a==="won_opportunities"||a==="search_clicks")&&x.value>y.value)fail("INTELLIGENCE_RATIO_INVALID");
  return {value:x.value/y.value*scale,unit,reason:null,sourceKey:x.sourceKey};
 }
 return {version:1,tenantId:t,mode:"fixture",window:{since:w.since,until:w.until},asOf,metrics,derived:{closed_win_rate:ratio("won_opportunities","closed_opportunities",100,"percent"),ads_ctr:ratio("ads_clicks","ads_impressions",100,"percent"),search_ctr:ratio("search_clicks","search_impressions",100,"percent"),ads_cpc_micros:ratio("ads_spend_micros","ads_clicks",1,"money_micros")},cashRealized:null,revenueRecognized:null,roas:null,productionReady:false};
}

export function intelligenceSourceKey(grant){return sourceKey(checkedSource(tenant(grant?.tenantId),grant));}

export function compareIntelligence(current,previous,thresholdPercent=20){
 if(!current||!previous||current.mode!=="fixture"||previous.mode!=="fixture"||current.version!==1||previous.version!==1||tenant(current.tenantId)!==tenant(previous.tenantId))fail("INTELLIGENCE_SCOPE_DENIED");
 if(period(current.window)!==period(previous.window)||day(previous.window.until)+86400000!==day(current.window.since))fail("INTELLIGENCE_PERIOD_INCOMPATIBLE");
 if(typeof thresholdPercent!=="number"||!Number.isFinite(thresholdPercent)||thresholdPercent<5||thresholdPercent>100)fail("INTELLIGENCE_THRESHOLD_INVALID");
 const comparisons=[],alerts=[];
 for(const name of Object.keys(METRICS)){
  const a=current.metrics?.[name],b=previous.metrics?.[name];
  if(!a||!b||a.value===null||b.value===null||a.reason!==null||b.reason!==null||!a.sourceKey||a.sourceKey!==b.sourceKey||a.currency!==b.currency||a.dayBasis!==b.dayBasis||a.unit!==b.unit)continue;
  count(a.value);count(b.value);
  const change=a.value-b.value,pct=b.value===0?null:change/b.value*100;
  comparisons.push({metric:name,current:a.value,previous:b.value,change,changePercent:pct,unit:a.unit,currency:a.currency,sourceKey:a.sourceKey});
  if(pct!==null&&Math.abs(pct)>=thresholdPercent&&Math.abs(change)>0)alerts.push({metric:name,type:"threshold_change",direction:change>0?"increase":"decrease",changePercent:pct,thresholdPercent,evidence:{current:a.value,previous:b.value,sourceKey:a.sourceKey},severity:"review",action:"review_only"});
 }
 return {tenantId:current.tenantId,mode:"fixture",comparisons,alerts,automaticActions:false,forecast:null};
}
