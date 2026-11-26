/** PR-L: offline, fixture-only proactivity planner. No scheduling, sending or calling. */
const KINDS=["daily_report","weekly_report","alert_review","meeting_proposal","voice_meeting"];
const DOMAINS=["commercial","finance","marketing"];
function fail(code){throw Error(code);}

function uuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);}

function id(v){if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v))fail("PROACTIVE_ID_INVALID");return v;}

function stamp(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail("PROACTIVE_TIME_INVALID");return Date.parse(v);}

function count(v){if(!Number.isSafeInteger(v)||v<0)fail("PROACTIVE_NUMBER_INVALID");return v;}

function add(a,b){return count(count(a)+count(b));}

function minute(v){if(typeof v!=="string"||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))fail("PROACTIVE_SCHEDULE_INVALID");return Number(v.slice(0,2))*60+Number(v.slice(3));}

function localParts(t,zone){
 if(typeof zone!=="string"||zone.length>80)fail("PROACTIVE_TIMEZONE_INVALID");
 let p;try{p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));}catch{fail("PROACTIVE_TIMEZONE_INVALID");}
 return {day:p.year+"-"+p.month+"-"+p.day,weekday:p.weekday,minute:minute(p.hour+":"+p.minute)};
}

function quiet(now,start,end){
 const s=minute(start),e=minute(end);
 if(s===e)fail("PROACTIVE_QUIET_HOURS_INVALID");
 return s<e?now>=s&&now<e:now>=s||now<e;
}

function context(input){
 const a=input?.actor,b=input?.binding,c=input?.config;
 if(input?.mode!=="fixture"||a?.mode!=="fixture"||c?.mode!=="fixture"||c.enabled!==true||!uuid(a.tenantId)||!uuid(a.userId)||a.role!=="owner"||a.membership!=="active"||a.tenantStatus!=="active"||a.executiveRead!==true||a.mfaVerified!==true)fail("PROACTIVE_ACCESS_DENIED");
 if(!b||b.mode!=="fixture"||b.tenantId!==a.tenantId||b.userId!==a.userId||!uuid(b.bindingId)||b.status!=="active"||b.revokedAt!==null||b.phoneVerified!==true||b.consent!==true||b.executiveRead!==true||b.channel!=="executive_whatsapp"||b.assetId!==c.dedicatedAssetId||c.commercialAssetIds?.includes(b.assetId))fail("PROACTIVE_BINDING_DENIED");
 id(b.assetId);
 if(!Array.isArray(c.commercialAssetIds)||c.commercialAssetIds.length>1000||new Set(c.commercialAssetIds).size!==c.commercialAssetIds.length||!Array.isArray(a.domains)||!Array.isArray(b.domains)||!a.domains.length||a.domains.length>3||b.domains.length>3||new Set(a.domains).size!==a.domains.length||new Set(b.domains).size!==b.domains.length||![...a.domains,...b.domains].every(d=>DOMAINS.includes(d)))fail("PROACTIVE_DOMAIN_DENIED");
 const now=stamp(input.nowISO),local=localParts(now,c.timezone);
 return {a,b,c,now,local};
}

function deny(code){return {mode:"fixture",decision:"blocked",reason:code,dispatch:false,calendarWrite:false,call:false,productionReady:false};}

function hasApproval(p,g,kind,reference){
 if(!p||p.mode!=="fixture"||p.tenantId!==g.a.tenantId||p.userId!==g.a.userId||p.bindingId!==g.b.bindingId||p.kind!==kind||p.reference!==reference||p.approved!==true||p.revoked!==false)return false;
 const issued=stamp(p.issuedAt),expires=stamp(p.expiresAt);
 return issued<=g.now&&expires>g.now&&expires-issued<=15*60000;
}

function matchingTemplate(template,g,kind){
 return !!template&&template.mode==="fixture"&&template.assetId===g.b.assetId&&template.kind===kind&&template.status==="approved"&&template.language==="pt_BR"&&template.genericOnly===true&&template.revoked===false&&typeof template.templateId==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(template.templateId);
}

function reviewBudget(ledger,g,kind,reference,estimate,key){
 // All money is USD micros for this isolated harness, not billing or actual reservation.
 if(!ledger||ledger.mode!=="fixture"||ledger.tenantId!==g.a.tenantId||ledger.currency!=="USD"||ledger.month!==g.local.day.slice(0,7)||ledger.complete!==true||!Array.isArray(ledger.intents)||ledger.intents.length>10000)return "BUDGET_UNVERIFIED";
 if(!estimate||estimate.mode!=="fixture"||estimate.tenantId!==g.a.tenantId||estimate.kind!==kind||estimate.reference!==reference||estimate.currency!=="USD"||stamp(estimate.expiresAt)<=g.now)return "ESTIMATE_UNVERIFIED";
 const cost=count(estimate.maxCostMicros),cap=count(ledger.monthlyLimitMicros),per=count(ledger.perIntentLimitMicros);
 if(!cost||!cap||!per||cost>per)return "BUDGET_LIMIT";
 let spent=0,attempts=0;const seen=new Set();
 for(const i of ledger.intents){
  if(!i||i.tenantId!==g.a.tenantId||i.currency!=="USD"||typeof i.key!=="string"||i.key.length>1024||seen.has(i.key)||!["reserved","accepted","ambiguous","settled","failed"].includes(i.state))fail("PROACTIVE_LEDGER_INVALID");
  seen.add(i.key);
  const at=stamp(i.at);
  if(at>g.now||localParts(at,g.c.timezone).day.slice(0,7)!==ledger.month)fail("PROACTIVE_LEDGER_INVALID");
  if(i.key===key)return "DUPLICATE_INTENT";
  // Failed or ambiguous attempts remain counted conservatively until reconciliation.
  spent=add(spent,count(i.maxCostMicros));
  if(localParts(at,g.c.timezone).day===g.local.day)attempts++;
 }
 if(add(spent,cost)>cap)return "BUDGET_LIMIT";
 if(!Number.isSafeInteger(g.c.maxDailyIntents)||g.c.maxDailyIntents<1||g.c.maxDailyIntents>5||attempts>=g.c.maxDailyIntents)return "DAILY_LIMIT";
 return null;
}

export function planExecutiveProactivity(input){
 const g=context(input),r=input.request;
 if(!r||!KINDS.includes(r.kind))fail("PROACTIVE_KIND_INVALID");
 const kind=r.kind,reference=id(r.reference);
 const domains=r.domains;
 if(!Array.isArray(domains)||!domains.length||domains.length>3||new Set(domains).size!==domains.length||!domains.every(d=>g.a.domains.includes(d)&&g.b.domains.includes(d)))return deny("DOMAIN_DENIED");
 if(quiet(g.local.minute,g.c.quietStart,g.c.quietEnd))return deny("QUIET_HOURS");
 const recurring=kind==="daily_report"||kind==="weekly_report";
 const message=recurring||kind==="alert_review";
 let occurrence=g.local.day;
 if(recurring){
  const s=input.schedule;
  if(!s||s.mode!=="fixture"||s.tenantId!==g.a.tenantId||s.bindingId!==g.b.bindingId||s.scheduleId!==reference||s.kind!==kind||s.enabled!==true||s.consent!==true||s.revoked!==false)return deny("SCHEDULE_DISABLED");
  const target=minute(s.localTime);
  if(g.local.minute<target||g.local.minute-target>=5)return deny("NOT_DUE");
  if(kind==="weekly_report"&&(!["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].includes(s.weekday)||g.local.weekday!==s.weekday))return deny("NOT_DUE");
 }
 if(kind==="alert_review"){
  const e=input.alert;
  if(!e||e.mode!=="fixture"||e.tenantId!==g.a.tenantId||e.reference!==reference||e.reviewRequired!==true||e.verifiedCoverage!==true||!domains.includes(e.domain)||stamp(e.observedAt)>g.now||g.now-stamp(e.observedAt)>24*3600000||g.b.alertConsent!==true)return deny("ALERT_NOT_VERIFIED");
  // Alert references are internal IDs only; never render data into a proactive notification.
  occurrence=reference;
 }
 if(message){
  // Even inside a possible conversation window, this planner only permits generic preapproved templates.
  if(g.b.proactiveConsent!==true||!matchingTemplate(input.template,g,kind))return deny("TEMPLATE_OR_CONSENT_REQUIRED");
 }
 let meeting=null;
 if(kind==="meeting_proposal"||kind==="voice_meeting"){
  if(!hasApproval(input.approval,g,kind,reference))return deny("EXPLICIT_APPROVAL_REQUIRED");
  const m=input.meeting;
  if(!m||m.mode!=="fixture"||m.tenantId!==g.a.tenantId||m.bindingId!==g.b.bindingId||m.reference!==reference||m.availabilityVerified!==true||m.conflict!==false)return deny("AVAILABILITY_UNVERIFIED");
  const start=stamp(m.startAt),end=stamp(m.endAt);
  if(start<g.now||start-g.now>30*86400000||end<=start||end-start>60*60000)return deny("MEETING_WINDOW_INVALID");
  const startLocal=localParts(start,g.c.timezone),endLocal=localParts(end-1,g.c.timezone);
  if(startLocal.day!==endLocal.day||quiet(startLocal.minute,g.c.quietStart,g.c.quietEnd)||quiet(endLocal.minute,g.c.quietStart,g.c.quietEnd))return deny("MEETING_QUIET_HOURS");
  // Reject a quiet interval anywhere between start and end, including DST transitions.
  for(let at=start;at<end;at+=60000)if(quiet(localParts(at,g.c.timezone).minute,g.c.quietStart,g.c.quietEnd))return deny("MEETING_QUIET_HOURS");
  meeting={startAt:m.startAt,endAt:m.endAt,timezone:g.c.timezone};
  occurrence=m.startAt;
 }
 if(kind==="voice_meeting"){
  const v=input.voicePermission,m=input.meeting;
  if(g.b.voiceConsent!==true||!v||v.mode!=="fixture"||v.tenantId!==g.a.tenantId||v.bindingId!==g.b.bindingId||v.assetId!==g.b.assetId||v.channel!=="whatsapp"||v.providerVerified!==true||v.revoked!==false||v.permissionStatus!=="verified"||v.executiveProviderCompatible!==true)return deny("VOICE_PERMISSION_REQUIRED");
  const confirmed=stamp(v.confirmedAt),expires=stamp(v.expiresAt),start=stamp(m.startAt);
  if(confirmed>g.now||g.now-confirmed>7*86400000||expires<=stamp(m.endAt)||start-confirmed>7*86400000)return deny("VOICE_PERMISSION_EXPIRED");
  if(!Number.isSafeInteger(r.durationSeconds)||r.durationSeconds<30||r.durationSeconds>180||stamp(m.endAt)-start!==r.durationSeconds*1000)return deny("VOICE_DURATION_LIMIT");
  // Existing Flip Voice lead-bound permission must NOT be treated as executive authorization.
 }
 const key=JSON.stringify([g.a.tenantId,g.b.bindingId,kind,reference,occurrence]);
 const budget=reviewBudget(input.ledger,g,kind,reference,input.estimate,key);
 if(budget)return deny(budget);
 return {mode:"fixture",decision:"review_intent",kind,key,domains:[...domains],occurrence,meeting,requiresReauthorization:true,requiresAtomicReservation:true,dispatch:false,calendarWrite:false,call:false,productionReady:false,estimatedMaxCostMicros:input.estimate.maxCostMicros,currency:"USD",templateId:message?input.template.templateId:null,deliveryContent:message?"generic_portal_notice_only":null};
}
