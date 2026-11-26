/** PR-G: offline Google organic reporting contracts. No network or persistent data. */
const GBP=["BUSINESS_IMPRESSIONS_DESKTOP_MAPS","BUSINESS_IMPRESSIONS_DESKTOP_SEARCH","BUSINESS_IMPRESSIONS_MOBILE_MAPS","BUSINESS_IMPRESSIONS_MOBILE_SEARCH","CALL_CLICKS","WEBSITE_CLICKS","BUSINESS_DIRECTION_REQUESTS"];
const YT=["views","estimatedMinutesWatched","subscribersGained","subscribersLost"];
const PROVIDERS={"gbp":"google_business_profile","youtube":"youtube_analytics","search":"google_search_console"};
const SCOPES={"gbp":"https://www.googleapis.com/auth/business.manage","youtube":"https://www.googleapis.com/auth/yt-analytics.readonly","search":"https://www.googleapis.com/auth/webmasters.readonly"};

function reject(code){throw new Error(code);}

function obj(v){if(!v||typeof v!=="object"||Array.isArray(v))reject("ORGANIC_RESPONSE_INVALID");return v;}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function arr(v,max){if(!Array.isArray(v)||v.length>max)reject("ORGANIC_RESPONSE_INVALID");return v;}

function optionalArray(o,k,max){return own(o,k)?arr(o[k],max):[];}

function dateValue(s){if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))reject("ORGANIC_DATE_INVALID");const d=new Date(s+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)reject("ORGANIC_DATE_INVALID");return d.getTime();}

function checkWindow(w){if(!w||dateValue(w.until)-dateValue(w.since)<0||dateValue(w.until)-dateValue(w.since)>=31*86400000)reject("ORGANIC_WINDOW_INVALID");}

function inWindow(day,w){dateValue(day);if(day<w.since||day>w.until)reject("ORGANIC_DATE_INVALID");return day;}

function resourceValid(provider,id){
 if(typeof id!=="string"||id.length>512)return false;
 if(provider===PROVIDERS.gbp)return /^locations\/[0-9]{1,32}$/.test(id);
 if(provider===PROVIDERS.youtube)return /^UC[A-Za-z0-9_-]{22}$/.test(id);
 if(provider===PROVIDERS.search)return /^(?:sc-domain:[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+|https?:\/\/[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?\/[A-Za-z0-9._~%/-]*)$/.test(id)&&!id.includes("..");
 return false;
}

function checkedScope(s,grants){
 if(!s||typeof s.tenantId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.tenantId)||!resourceValid(s.provider,s.resourceId)||!Array.isArray(grants)||grants.length>100)reject("ORGANIC_SCOPE_DENIED");
 const matches=grants.filter(g=>g&&g.provider===s.provider&&g.resourceId===s.resourceId);
 if(matches.length!==1||matches[0].tenantId!==s.tenantId)reject("ORGANIC_SCOPE_DENIED");
 const g=matches[0];
 if(typeof g.connectionId!=="string"||!/^[A-Za-z0-9_-]{8,100}$/.test(g.connectionId))reject("ORGANIC_CONNECTION_INVALID");
 if(g.provider===PROVIDERS.gbp&&(typeof g.accountId!=="string"||!/^accounts\/[0-9]{1,32}$/.test(g.accountId)))reject("ORGANIC_CONNECTION_INVALID");
 return {tenantId:g.tenantId,provider:g.provider,resourceId:g.resourceId,connectionId:g.connectionId,accountId:g.provider===PROVIDERS.gbp?g.accountId:null};
}

function reportType(g,kind){if(!((g.provider===PROVIDERS.gbp&&["daily","reviews"].includes(kind))||(g.provider===PROVIDERS.youtube&&kind==="daily")||(g.provider===PROVIDERS.search&&["daily","top_queries"].includes(kind))))reject("ORGANIC_REPORT_INVALID");}

function qs(pairs){return pairs.map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(String(v))).join("&");}

function gbpDate(prefix,day){const [y,m,d]=day.split("-").map(Number);return [[prefix+".year",y],[prefix+".month",m],[prefix+".day",d]];}

function count(v){if(typeof v==="string"&&/^\d{1,16}$/.test(v))v=Number(v);if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0)reject("ORGANIC_METRIC_INVALID");return v;}

function decimal(v,min,max){if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)reject("ORGANIC_METRIC_INVALID");return v;}

function binding(g,kind,w){return JSON.stringify([g.tenantId,g.provider,g.resourceId,g.connectionId,g.accountId,kind,w?.since??null,w?.until??null]);}

export function buildGoogleOrganicPlan(scope,grants,kind,window=null){
 const g=checkedScope(scope,grants);reportType(g,kind);
 if(kind==="reviews"){if(window!==null)reject("ORGANIC_WINDOW_INVALID");}
 else checkWindow(window);
 const result={connectionId:g.connectionId,reportKey:binding(g,kind,window),method:"GET"};
 if(g.provider===PROVIDERS.gbp){
  if(kind==="reviews")return {...result,scope:SCOPES.gbp,url:"https://mybusiness.googleapis.com/v4/"+g.accountId+"/"+g.resourceId+"/reviews?"+qs([["pageSize",1],["fields","averageRating,totalReviewCount"]])};
  return {...result,scope:SCOPES.gbp,url:"https://businessprofileperformance.googleapis.com/v1/"+g.resourceId+":fetchMultiDailyMetricsTimeSeries?"+qs([...GBP.map(m=>["dailyMetrics",m]),...gbpDate("dailyRange.start_date",window.since),...gbpDate("dailyRange.end_date",window.until)])};
 }
 if(g.provider===PROVIDERS.youtube)return {...result,scope:SCOPES.youtube,url:"https://youtubeanalytics.googleapis.com/v2/reports?"+qs([["ids","channel=="+g.resourceId],["startDate",window.since],["endDate",window.until],["dimensions","day"],["metrics",YT.join(",")],["sort","day"]])};
 return {...result,method:"POST",scope:SCOPES.search,url:"https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(g.resourceId)+"/searchAnalytics/query",body:{startDate:window.since,endDate:window.until,dimensions:[kind==="daily"?"date":"query"],type:"web",aggregationType:"byProperty",dataState:"final",rowLimit:kind==="daily"?31:250,startRow:0}};
}

export function normalizeGoogleOrganic(scope,grants,kind,window,receipt,payload){
 const g=checkedScope(scope,grants),plan=buildGoogleOrganicPlan(scope,grants,kind,window);
 // Receipt is a server-created transport binding, NOT an authentication mechanism.
 if(!receipt||receipt.reportKey!==plan.reportKey||receipt.connectionId!==g.connectionId)reject("ORGANIC_RECEIPT_MISMATCH");
 const r=obj(payload);if(own(r,"error"))reject("ORGANIC_PROVIDER_ERROR");
 const common={tenantId:g.tenantId,provider:g.provider,resourceId:g.resourceId,reportKind:kind,coverage:"unverified"};
 const seen=new Set(),rows=[];
 function add(key,row){if(seen.has(key))reject("ORGANIC_DUPLICATE_ROW");seen.add(key);rows.push(row);}
 if(g.provider===PROVIDERS.gbp){
  if(kind==="reviews"){
   const total=count(r.totalReviewCount);
   const rating=total===0?(r.averageRating==null||r.averageRating===0?null:reject("ORGANIC_METRIC_INVALID")):decimal(r.averageRating,1,5);
   // Never return review text, names, identities or raw payload.
   return {...common,coverage:"snapshot",rows:[{totalReviewCount:total,averageRating:rating}]};
  }
  for(const group of optionalArray(r,"multiDailyMetricTimeSeries",GBP.length)){
   for(const entry of optionalArray(obj(group),"dailyMetricTimeSeries",GBP.length)){
    const e=obj(entry);
    if(!GBP.includes(e.dailyMetric)||e.dailySubEntityType!=null)reject("ORGANIC_METRIC_INVALID");
    for(const dp of optionalArray(obj(e.timeSeries),"datedValues",31)){
     const d=obj(obj(dp).date);
     if(!Number.isInteger(d.year)||!Number.isInteger(d.month)||!Number.isInteger(d.day))reject("ORGANIC_DATE_INVALID");
     const day=inWindow(String(d.year).padStart(4,"0")+"-"+String(d.month).padStart(2,"0")+"-"+String(d.day).padStart(2,"0"),window);
     // Google's DatedValue omits value specifically for zero. Missing date != zero.
     add(day+"|"+e.dailyMetric,{day,metric:e.dailyMetric,value:own(dp,"value")?count(dp.value):0});
    }
   }
  }
  return {...common,dayBasis:"provider_report_date",rows};
 }
 if(g.provider===PROVIDERS.youtube){
  const expected=["day",...YT],headers=arr(r.columnHeaders,expected.length);
  if(headers.length!==expected.length||headers.some((h,i)=>!h||h.name!==expected[i]||h.columnType!==(i===0?"DIMENSION":"METRIC")))reject("ORGANIC_COLUMNS_INVALID");
  for(const raw of optionalArray(r,"rows",31)){
   const row=arr(raw,expected.length);if(row.length!==expected.length)reject("ORGANIC_COLUMNS_INVALID");
   const day=inWindow(row[0],window);
   add(day,{day,views:count(row[1]),estimatedMinutesWatched:count(row[2]),subscribersGained:count(row[3]),subscribersLost:count(row[4])});
  }
  return {...common,dayBasis:"America/Los_Angeles",rows};
 }
 if(r.responseAggregationType!=="byProperty")reject("ORGANIC_AGGREGATION_INVALID");
 if(r.metadata?.first_incomplete_date!=null||r.metadata?.first_incomplete_hour!=null)reject("ORGANIC_INCOMPLETE_DATA");
 for(const raw of optionalArray(r,"rows",kind==="daily"?31:250)){
  const v=obj(raw),key=arr(v.keys,1);if(key.length!==1)reject("ORGANIC_COLUMNS_INVALID");
  if(kind==="daily")inWindow(key[0],window);
  else if(typeof key[0]!=="string"||key[0].length<1||key[0].length>512||/[\u0000-\u001f\u007f]/.test(key[0]))reject("ORGANIC_QUERY_INVALID");
  const clicks=count(v.clicks),impressions=count(v.impressions),ctr=decimal(v.ctr,0,1),position=decimal(v.position,0,1000000);
  if(clicks>impressions||Math.abs(ctr-(impressions?clicks/impressions:0))>0.000001)reject("ORGANIC_METRIC_INVALID");
  add(key[0],{...(kind==="daily"?{day:key[0]}:{query:key[0]}),clicks,impressions,ctr,position});
 }
 return {...common,coverage:kind==="top_queries"?"top_only":"unverified",dayBasis:"America/Los_Angeles",rows};
}

export function summarizeSearchDaily(report){
 if(!report||report.provider!==PROVIDERS.search||report.reportKind!=="daily"||report.dayBasis!=="America/Los_Angeles")reject("ORGANIC_AGGREGATION_INVALID");
 let clicks=0,impressions=0,weighted=0;const seen=new Set();
 for(const row of arr(report.rows,31)){
  dateValue(row.day);if(seen.has(row.day))reject("ORGANIC_DUPLICATE_ROW");seen.add(row.day);
  const c=count(row.clicks),i=count(row.impressions),p=decimal(row.position,0,1000000);
  if(c>i)reject("ORGANIC_METRIC_INVALID");clicks+=c;impressions+=i;weighted+=p*i;
  if(!Number.isSafeInteger(clicks)||!Number.isSafeInteger(impressions)||!Number.isFinite(weighted))reject("ORGANIC_METRIC_OVERFLOW");
 }
 return {clicks,impressions,ctr:impressions?clicks/impressions:null,averagePosition:impressions?weighted/impressions:null,coverage:"unverified",observedDays:seen.size};
}
