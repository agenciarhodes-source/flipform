/** PR-F: pure reporting contracts. No fetch, secrets, database or provider mutation. */
const MAX_PAGE=100, MAX_PAGES=200;
function fail(code){throw new Error(code);}

function record(value){if(!value||typeof value!=="object"||Array.isArray(value))fail("ADS_RESPONSE_INVALID");return value;}

function own(value,key){return Object.prototype.hasOwnProperty.call(value,key);}

function validDay(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail("ADS_DATE_INVALID");
 const d=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)fail("ADS_DATE_INVALID");return d.getTime();
}

function validateWindow(window){
 const span=(validDay(window.until)-validDay(window.since))/86400000;
 if(span<0||span>=30)fail("ADS_WINDOW_INVALID");
}

function checkedGrant(scope,grants){
 if(!scope||!Array.isArray(grants)||grants.length>100||typeof scope.tenantId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(scope.tenantId))fail("ADS_SCOPE_DENIED");
 if(typeof scope.accountId!=="string"||!((scope.provider==="tiktok_ads"&&/^[0-9]{1,32}$/.test(scope.accountId))||(scope.provider==="chatgpt_ads"&&/^adacct_[A-Za-z0-9_-]{1,96}$/.test(scope.accountId))))fail("ADS_SCOPE_DENIED");
 const matching=grants.filter(g=>g.provider===scope.provider&&g.accountId===scope.accountId);
 if(matching.length!==1||matching[0].tenantId!==scope.tenantId)fail("ADS_SCOPE_DENIED");
 const g=matching[0];
 if(typeof g.connectionId!=="string"||!/^[A-Za-z0-9_-]{8,100}$/.test(g.connectionId)||typeof g.currency!=="string"||!/^[A-Z]{3}$/.test(g.currency)||typeof g.timezone!=="string"||g.timezone.length>100)fail("ADS_BINDING_INVALID");
 try{new Intl.DateTimeFormat("en-US",{timeZone:g.timezone});}catch{fail("ADS_BINDING_INVALID");}
 return {tenantId:scope.tenantId,provider:scope.provider,accountId:scope.accountId,connectionId:g.connectionId,currency:g.currency,timezone:g.timezone};
}

function reportKey(g,window){return JSON.stringify([g.tenantId,g.provider,g.accountId,g.connectionId,g.currency,g.timezone,window.since,window.until,"campaign","daily"]);}

function checkedCursor(g,window,cursor){
 if(cursor==null)return g.provider==="tiktok_ads"?1:null;
 if(cursor.reportKey!==reportKey(g,window)||cursor.provider!==g.provider)fail("ADS_CURSOR_SCOPE");
 if(g.provider==="tiktok_ads"){
  if(!Number.isSafeInteger(cursor.value)||cursor.value<2||cursor.value>MAX_PAGES)fail("ADS_CURSOR_INVALID");
 }else if(typeof cursor.value!=="string"||cursor.value.length<1||cursor.value.length>2048||/[\u0000-\u001f\u007f]/.test(cursor.value))fail("ADS_CURSOR_INVALID");
 return cursor.value;
}

function queryString(entries){return entries.map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(String(v))).join("&");}

function nullableCount(value){
 if(value==null||value==="-")return null;
 if((typeof value!=="number"&&typeof value!=="string")||!/^\d{1,16}$/.test(String(value)))fail("ADS_METRIC_INVALID");
 const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail("ADS_METRIC_INVALID");return n;
}

function nullableMicros(value){
 if(value==null||value==="-")return null;
 if((typeof value!=="number"&&typeof value!=="string")||!/^\d{1,10}(?:\.\d{1,6})?$/.test(String(value)))fail("ADS_METRIC_INVALID");
 const [whole,fraction=""]=String(value).split(".");
 const n=Number(whole)*1000000+Number(fraction.padEnd(6,"0"));
 if(!Number.isSafeInteger(n)||n<0)fail("ADS_METRIC_INVALID");return n;
}

function safeName(value){
 if(typeof value!=="string")return null;
 const clean=value.replace(/[\u0000-\u001f\u007f]/g," ").trim();return clean?clean.slice(0,180):null;
}

function campaignId(provider,id){
 if(typeof id!=="string"||!(provider==="tiktok_ads"?/^[0-9]{1,32}$/:/^cmpn_[A-Za-z0-9_-]{1,96}$/).test(id))fail("ADS_ID_INVALID");return id;
}

export function buildChatGPTAccountCheck(scope,grants){
 const g=checkedGrant(scope,grants);if(g.provider!=="chatgpt_ads")fail("ADS_SCOPE_DENIED");
 return {method:"GET",url:"https://api.ads.openai.com/v1/ad_account",connectionId:g.connectionId,auth:"advertiser_bearer"};
}

export function verifyChatGPTAccount(scope,grants,payload){
 const g=checkedGrant(scope,grants),a=record(payload);
 if(g.provider!=="chatgpt_ads"||a.id!==g.accountId||a.currency_code!==g.currency||a.timezone!==g.timezone)fail("ADS_ACCOUNT_MISMATCH");
 return g;
}

export function buildAdditionalAdsReadPlan(scope,grants,window,cursor=null){
 const g=checkedGrant(scope,grants);validateWindow(window);
 const c=checkedCursor(g,window,cursor);
 if(g.provider==="tiktok_ads"){
  const entries=[["advertiser_ids",JSON.stringify([g.accountId])],["dimensions",JSON.stringify(["campaign_id","stat_time_day"])],["metrics",JSON.stringify(["campaign_name","impressions","clicks","spend"])],["start_date",window.since],["end_date",window.until],["query_in_utc0","false"],["page",c],["page_size",MAX_PAGE]];
  return {method:"GET",url:"https://business-api.tiktok.com/open_api/v2.0/report/integrated/get/?"+queryString(entries),connectionId:g.connectionId,auth:"tiktok_access_token",reportKey:reportKey(g,window)};
 }
 const entries=[["aggregation_level","campaign"],["time_granularity","daily"],["time_ranges[]",JSON.stringify({type:"date_range",since:window.since,until:window.until,timezone:g.timezone})],["limit",MAX_PAGE],...["metadata.readable_time","campaign.id","campaign.name","campaign.impressions","campaign.clicks","campaign.spend"].map(f=>["fields[]",f])];
 if(c!==null)entries.push(["after",c]);
 return {method:"GET",url:"https://api.ads.openai.com/v1/ad_account/insights?"+queryString(entries),connectionId:g.connectionId,auth:"advertiser_bearer",reportKey:reportKey(g,window)};
}

export function normalizeReportPage(scope,grants,window,verifiedAccount,payload,cursor=null){
 const g=checkedGrant(scope,grants);validateWindow(window);
 const current=checkedCursor(g,window,cursor);
 // This receipt is trusted transport context, never provider JSON or user input.
 // It does not itself authenticate a credential; no transport is enabled in PR-F.
 if(!verifiedAccount||["tenantId","provider","accountId","connectionId","currency","timezone"].some(k=>verifiedAccount[k]!==g[k]))fail("ADS_ACCOUNT_MISMATCH");
 const root=record(payload);
 let items,next=null;
 if(g.provider==="tiktok_ads"){
  if(root.code!==0)fail("ADS_PROVIDER_ERROR");
  const data=record(root.data),paging=record(data.page_info),extra=data.extra_info;
  if(extra!=null&&Object.keys(record(extra)).length>0)fail("ADS_REPORT_INCOMPLETE");
  if(paging.page!==current||!Number.isSafeInteger(paging.total_page)||paging.total_page<0||paging.total_page>MAX_PAGES||paging.page_size!==MAX_PAGE||!Number.isSafeInteger(paging.total_number)||paging.total_number<0||paging.total_number>MAX_PAGE*MAX_PAGES||paging.total_page!==Math.ceil(paging.total_number/MAX_PAGE))fail("ADS_PAGE_INVALID");
  if((paging.total_page===0&&current!==1)||(paging.total_page>0&&current>paging.total_page))fail("ADS_PAGE_INVALID");
  if(!Array.isArray(data.list)||data.list.length!==Math.max(0,Math.min(MAX_PAGE,paging.total_number-(current-1)*MAX_PAGE)))fail("ADS_PAGE_INVALID");
  items=data.list.map(item=>{
   const r=record(item),d=record(r.dimensions),m=record(r.metrics);
   if((own(m,"advertiser_id")&&m.advertiser_id!==g.accountId)||(own(m,"currency")&&m.currency!==g.currency))fail("ADS_ACCOUNT_MISMATCH");
   return {id:d.campaign_id,day:d.stat_time_day,name:m.campaign_name,impressions:m.impressions,clicks:m.clicks,spend:m.spend};
  });
  if(current<paging.total_page)next=current+1;
 }else{
  if(root.error||root.object!=="list"||typeof root.has_more!=="boolean"||!Array.isArray(root.data)||root.data.length>MAX_PAGE||root.count!==root.data.length)fail("ADS_PAGE_INVALID");
  items=root.data.map(item=>{const r=record(item);if(own(r,"ad_account_id")&&r.ad_account_id!==g.accountId)fail("ADS_ACCOUNT_MISMATCH");return {id:r.campaign_id,day:r.readable_time,name:r.campaign_name,impressions:r.impressions,clicks:r.clicks,spend:r.spend};});
  if(root.has_more){
   if(!items.length||typeof root.last_id!=="string"||root.last_id===current||root.last_id.length<1||root.last_id.length>2048||/[\u0000-\u001f\u007f]/.test(root.last_id))fail("ADS_CURSOR_INVALID");
   next=root.last_id;
  }
 }
 if(items.length>MAX_PAGE)fail("ADS_PAGE_INVALID");
 const seen=new Set();
 const rows=items.map(item=>{
  validDay(item.day);if(item.day<window.since||item.day>window.until)fail("ADS_DATE_INVALID");
  const id=campaignId(g.provider,item.id),key=JSON.stringify([g.tenantId,g.provider,g.accountId,item.day,id]);
  if(seen.has(key))fail("ADS_DUPLICATE_ROW");seen.add(key);
  return {tenantId:g.tenantId,provider:g.provider,accountId:g.accountId,level:"campaign",date:item.day,campaignId:id,campaignName:safeName(item.name),currency:g.currency,timezone:g.timezone,spendMicros:nullableMicros(item.spend),impressions:nullableCount(item.impressions),clicks:nullableCount(item.clicks)};
 });
 return {rows,nextCursor:next===null?null:{provider:g.provider,reportKey:reportKey(g,window),value:next},pageExhausted:next===null,coverage:"unverified"};
}

export function deliveryMetrics(rows){
 if(!Array.isArray(rows)||!rows.length)return null;
 const f=rows[0],seen=new Set();let spend=0,clicks=0,impressions=0,hasSpend=true,hasClicks=true,hasImpressions=true;
 for(const r of rows){
  if(r.level!=="campaign"||["tenantId","provider","accountId","currency","timezone"].some(k=>r[k]!==f[k]))fail("ADS_AGGREGATE_SCOPE");
  const key=JSON.stringify([r.date,r.campaignId]);if(seen.has(key))fail("ADS_DUPLICATE_ROW");seen.add(key);
  for(const v of [r.spendMicros,r.clicks,r.impressions])if(v!==null&&(!Number.isSafeInteger(v)||v<0))fail("ADS_METRIC_INVALID");
  if(r.spendMicros===null)hasSpend=false;else spend+=r.spendMicros;
  if(r.clicks===null)hasClicks=false;else clicks+=r.clicks;
  if(r.impressions===null)hasImpressions=false;else impressions+=r.impressions;
  if(![spend,clicks,impressions].every(Number.isSafeInteger))fail("ADS_METRIC_OVERFLOW");
 }
 return {currency:f.currency,spendMicros:hasSpend?spend:null,clicks:hasClicks?clicks:null,impressions:hasImpressions?impressions:null,ctrPercent:hasClicks&&hasImpressions&&impressions>0?clicks/impressions*100:null,cpc:hasSpend&&hasClicks&&clicks>0?spend/1000000/clicks:null,cpl:null,cpa:null,roas:null,coverage:"unverified"};
}
