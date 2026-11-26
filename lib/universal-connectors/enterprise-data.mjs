/** PR-H: offline canonical enterprise records and bounded read plans. No network, writes or activation. */
const KINDS=["order","inventory_snapshot","crm_opportunity","receivable","payable"];
const STATES={"order":["pending","confirmed","fulfilled","cancelled","unknown"],"crm_opportunity":["open","won","lost","unknown"],"receivable":["open","overdue","confirmed","received","refunded","cancelled","unknown"],"payable":["open","overdue","paid","cancelled","unknown"]};
const SERIES={"432":{"indicator":"selic_target","unit":"percent_per_year","frequency":"daily"},"433":{"indicator":"ipca","unit":"percent_per_month","frequency":"monthly"}};
const LIMIT=100;
const MAX_OFFSET=9900;

function fail(code){throw Error(code);}

function object(v){if(!v||typeof v!=="object"||Array.isArray(v))fail("ENTERPRISE_INVALID_RECORD");return v;}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function identifier(v){if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v))fail("ENTERPRISE_INVALID_ID");return v;}

function day(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail("ENTERPRISE_INVALID_DATE");const d=new Date(v+"T00:00:00.000Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail("ENTERPRISE_INVALID_DATE");return d.getTime();}

function time(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))fail("ENTERPRISE_INVALID_TIMESTAMP");const t=Date.parse(v);if(!Number.isFinite(t)||new Date(t).toISOString()!==v)fail("ENTERPRISE_INVALID_TIMESTAMP");return v;}

function windowCheck(w,max){if(!w)fail("ENTERPRISE_INVALID_WINDOW");const n=(day(w.until)-day(w.since))/86400000;if(n<0||n>=max)fail("ENTERPRISE_INVALID_WINDOW");}

function integer(v){if(!Number.isSafeInteger(v)||v<0)fail("ENTERPRISE_INVALID_NUMBER");return v;}

function cents(v){if((typeof v!=="string"&&typeof v!=="number")||!/^\d{1,12}(?:\.\d{1,2})?$/.test(String(v)))fail("ENTERPRISE_INVALID_MONEY");const [a,b=""]=String(v).split(".");return integer(Number(a)*100+Number(b.padEnd(2,"0")));}

function money(v){if(v==null)return null;const x=object(v);if(!["BRL","USD","EUR"].includes(x.currency))fail("ENTERPRISE_CURRENCY_UNSUPPORTED");return {currency:x.currency,amountMinor:integer(x.amountMinor)};}

function status(kind,s){if(!own(STATES,kind)||!STATES[kind].includes(s))fail("ENTERPRISE_INVALID_STATUS");return s;}

function scopeCheck(s,grants,kind){
 if(!s||typeof s.tenantId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.tenantId)||!KINDS.includes(kind)||!Array.isArray(grants)||grants.length>100)fail("ENTERPRISE_SCOPE_DENIED");
 identifier(s.connectionId);identifier(s.accountId);
 if(typeof s.providerId!=="string"||!/^[a-z][a-z0-9_-]{2,63}$/.test(s.providerId))fail("ENTERPRISE_SCOPE_DENIED");
 const matched=grants.filter(g=>g&&g.providerId===s.providerId&&g.accountId===s.accountId);
 if(matched.length!==1)fail("ENTERPRISE_SCOPE_DENIED");
 const g=matched[0];
 if(g.tenantId!==s.tenantId||g.connectionId!==s.connectionId||!Array.isArray(g.kinds)||!g.kinds.includes(kind)||!["sandbox","fixture"].includes(g.environment))fail("ENTERPRISE_SCOPE_DENIED");
 if(s.providerId==="asaas_sandbox"&&(g.environment!=="sandbox"||kind!=="receivable"))fail("ENTERPRISE_SCOPE_DENIED");
 if(s.providerId!=="asaas_sandbox"&&g.environment!=="fixture")fail("ENTERPRISE_SCOPE_DENIED");
 return {tenantId:s.tenantId,connectionId:s.connectionId,providerId:s.providerId,accountId:s.accountId,environment:g.environment};
}

function receiptKey(g,kind,window=null,offset=null){return JSON.stringify([g.tenantId,g.connectionId,g.providerId,g.accountId,g.environment,kind,window?.since??null,window?.until??null,offset]);}

function checkedReceipt(r,g,key){if(!r||r.connectionId!==g.connectionId||r.accountId!==g.accountId||r.reportKey!==key)fail("ENTERPRISE_RECEIPT_MISMATCH");return time(r.observedAt);}

function rows(v,limit=LIMIT){if(!Array.isArray(v)||v.length>limit)fail("ENTERPRISE_INVALID_PAGE");return v;}

function uniqueRecords(records){const seen=new Set();for(const row of records){const k=JSON.stringify([row.kind,row.sourceId]);if(seen.has(k))fail("ENTERPRISE_DUPLICATE_RECORD");seen.add(k);}return records;}

function provenance(g,kind,id,observedAt,updatedAt){return {...g,kind,sourceId:identifier(id),observedAt,sourceUpdatedAt:updatedAt==null?null:time(updatedAt),coverage:"unverified"};}

export function normalizeEnterpriseFixture(scope,grants,kind,receipt,payload){
 const g=scopeCheck(scope,grants,kind);
 if(g.environment!=="fixture")fail("ENTERPRISE_FIXTURE_ONLY");
 const observedAt=checkedReceipt(receipt,g,receiptKey(g,kind));
 return uniqueRecords(rows(payload).map(raw=>{
  const r=object(raw),p=provenance(g,kind,r.id,observedAt,r.updatedAt);
  if(p.sourceUpdatedAt!==null&&p.sourceUpdatedAt>observedAt)fail("ENTERPRISE_INVALID_TIMESTAMP");
  if(kind==="inventory_snapshot"){
   const quantity=integer(r.quantity);day(r.snapshotDate);
   return {...p,sku:identifier(r.sku),warehouseId:identifier(r.warehouseId),quantity,unit:"each",snapshotDate:r.snapshotDate};
  }
  const state=status(kind,r.status),amount=money(r.money);
  if(kind==="order"){day(r.orderDate);return {...p,status:state,orderDate:r.orderDate,orderTotal:amount};}
  if(kind==="crm_opportunity"){
   day(r.createdDate);if(r.closedDate!=null)day(r.closedDate);
   if(r.closedDate!=null&&r.closedDate<r.createdDate)fail("ENTERPRISE_INVALID_DATE");
   if((state==="won"||state==="lost")!== (r.closedDate!=null))fail("ENTERPRISE_INVALID_STATUS");
   return {...p,status:state,createdDate:r.createdDate,closedDate:r.closedDate??null,expectedValue:amount};
  }
  day(r.dueDate);
  return {...p,status:state,dueDate:r.dueDate,faceValue:amount,cashRealized:null};
 }));
}

export function enterpriseFixtureKey(scope,grants,kind){const g=scopeCheck(scope,grants,kind);if(g.environment!=="fixture")fail("ENTERPRISE_FIXTURE_ONLY");return receiptKey(g,kind);}

export function asaasReadPlan(scope,grants,window,cursor=null){
 const g=scopeCheck(scope,grants,"receivable");if(g.providerId!=="asaas_sandbox")fail("ENTERPRISE_SANDBOX_ONLY");windowCheck(window,31);
 const key=receiptKey(g,"receivable",window),offset=cursor===null?0:cursor.offset;
 if(cursor!==null&&(cursor.reportKey!==key||!Number.isSafeInteger(offset)||offset<LIMIT||offset>MAX_OFFSET||offset%LIMIT!==0))fail("ENTERPRISE_CURSOR_INVALID");
 const q=[["offset",offset],["limit",LIMIT],["dueDate[ge]",window.since],["dueDate[le]",window.until]].map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(String(v))).join("&");
 return {method:"GET",url:"https://api-sandbox.asaas.com/v3/payments?"+q,auth:"asaas_access_token",connectionId:g.connectionId,accountId:g.accountId,reportKey:receiptKey(g,"receivable",window,offset),offset};
}

export function normalizeAsaasPage(scope,grants,window,receipt,payload,cursor=null){
 const plan=asaasReadPlan(scope,grants,window,cursor),g=scopeCheck(scope,grants,"receivable"),observedAt=checkedReceipt(receipt,g,plan.reportKey),r=object(payload);
 if(own(r,"errors")||r.object!=="list"||typeof r.hasMore!=="boolean"||r.offset!==plan.offset||r.limit!==LIMIT)fail("ENTERPRISE_PROVIDER_PAGE");
 const list=rows(r.data),total=integer(r.totalCount);
 if(list.length!==Math.max(0,Math.min(LIMIT,total-plan.offset))||r.hasMore!==(plan.offset+list.length<total)||(r.hasMore&&plan.offset>=MAX_OFFSET))fail("ENTERPRISE_PROVIDER_PAGE");
 const mapping={PENDING:"open",OVERDUE:"overdue",CONFIRMED:"confirmed",RECEIVED:"received",RECEIVED_IN_CASH:"received",REFUNDED:"refunded"};
 const out=uniqueRecords(list.map(raw=>{
  const p=object(raw);if(p.object!=="payment"||typeof p.id!=="string"||!/^pay_[A-Za-z0-9_-]{1,96}$/.test(p.id)||typeof p.status!=="string"||!/^[A-Z_]{1,50}$/.test(p.status))fail("ENTERPRISE_PROVIDER_RECORD");
  day(p.dueDate);if(p.dueDate<window.since||p.dueDate>window.until)fail("ENTERPRISE_INVALID_DATE");
  return {...provenance(g,"receivable",p.id,observedAt,null),status:own(mapping,p.status)?mapping[p.status]:"unknown",providerStatus:p.status,dueDate:p.dueDate,faceValue:{currency:"BRL",amountMinor:cents(p.value)},cashRealized:null};
 }));
 return {records:out,nextCursor:r.hasMore?{reportKey:receiptKey(g,"receivable",window),offset:plan.offset+LIMIT}:null,coverage:"unverified"};
}

export function bcbPlan(series,window){
 if(typeof series!=="string"||!own(SERIES,series))fail("MARKET_SERIES_DENIED");windowCheck(window,366);
 const br=s=>s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4);
 return {method:"GET",url:"https://api.bcb.gov.br/dados/serie/bcdata.sgs."+series+"/dados?formato=json&dataInicial="+encodeURIComponent(br(window.since))+"&dataFinal="+encodeURIComponent(br(window.until)),auth:"none",reportKey:JSON.stringify(["bcb_sgs",series,window.since,window.until])};
}

export function normalizeBcb(series,window,receipt,payload){
 const plan=bcbPlan(series,window);if(!receipt||receipt.reportKey!==plan.reportKey)fail("MARKET_RECEIPT_MISMATCH");
 const observedAt=time(receipt.observedAt),seen=new Set(),meta=SERIES[series];
 return rows(payload,366).map(raw=>{
  const r=object(raw);if(typeof r.data!=="string"||!/^\d{2}\/\d{2}\/\d{4}$/.test(r.data))fail("ENTERPRISE_INVALID_DATE");
  const d=r.data.slice(6,10)+"-"+r.data.slice(3,5)+"-"+r.data.slice(0,2);day(d);
  if(d<window.since||d>window.until||seen.has(meta.frequency==="monthly"?d.slice(0,7):d))fail("MARKET_INVALID_PERIOD");
  const period=meta.frequency==="monthly"?d.slice(0,7):d;seen.add(period);
  if(typeof r.valor!=="string"||! /^-?\d{1,6}(?:\.\d{1,8})?$/.test(r.valor))fail("MARKET_INVALID_VALUE");
  const value=Number(r.valor);if(!Number.isFinite(value)||(series==="432"&&value<0))fail("MARKET_INVALID_VALUE");
  return {source:"bcb_sgs",series,...meta,period,providerDate:d,value,observedAt,coverage:"unverified",futureDated:d>observedAt.slice(0,10)};
 });
}

export function selectEnterpriseSource(records,scope,grants,kind){
 const g=scopeCheck(scope,grants,kind);
 if(!Array.isArray(records)||records.length>10000)fail("ENTERPRISE_INVALID_PAGE");
 const selected=[];
 for(const r of records){
  if(!r||r.tenantId!==g.tenantId)fail("ENTERPRISE_SCOPE_DENIED");
  if(r.kind===kind&&r.connectionId===g.connectionId){
   if(r.providerId!==g.providerId||r.accountId!==g.accountId||r.environment!==g.environment)fail("ENTERPRISE_SCOPE_DENIED");
   selected.push(r);
  }
 }
 return {records:uniqueRecords(selected),sourceConnectionId:g.connectionId,coverage:"unverified"};
}
