/** PR-K: disconnected fixture-only WhatsApp executive channel policy. */
const COMMANDS={"resumo comercial":"commercial","resumo financeiro":"finance","resumo marketing":"marketing","resumo geral":"all"};
function fail(c){throw Error(c);}

function uuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);}

function phone(v){if(typeof v!=="string"||!/^[1-9][0-9]{7,14}$/.test(v))fail("EXEC_WA_INVALID_PHONE");return v;}

function providerId(v){if(typeof v!=="string"||!/^[0-9]{1,32}$/.test(v))fail("EXEC_WA_INVALID_ASSET");return v;}

function timestamp(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail("EXEC_WA_INVALID_TIME");return Date.parse(v);}

function messageId(v){if(typeof v!=="string"||!/^wamid\.[A-Za-z0-9_+/=-]{1,400}$/.test(v))fail("EXEC_WA_INVALID_MESSAGE");return v;}

function list(v,max){if(!Array.isArray(v)||v.length>max)fail("EXEC_WA_INVALID_CONTEXT");return v;}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function denial(code){return {mode:"fixture",decision:"deny",code,allowExecutiveRead:false,allowCommercialFallback:false,dispatch:false};}

export function routeExecutiveAsset(config,event){
 // Signature verification must occur before this function, in the actual webhook runtime.
 // This fixture contract cannot verify an HTTP request.
 if(config?.mode!=="fixture"||config.enabled!==true||event?.mode!=="fixture"||event.signatureVerified!==true)return "deny";
 const dedicated=providerId(config.executivePhoneNumberId),incoming=providerId(event.phoneNumberId);
 const commercial=list(config.commercialPhoneNumberIds,1000).map(providerId);
 if(new Set(commercial).size!==commercial.length||commercial.includes(dedicated))return "deny";
 if(incoming===dedicated)return "executive";
 if(commercial.includes(incoming))return "commercial_separate";
 return "deny";
}

export function authorizeExecutiveWhatsApp({config,event,bindings,proof,seenMessageKeys,nowISO}){
 if(routeExecutiveAsset(config,event)!=="executive")return denial("ASSET_NOT_EXECUTIVE");
 const now=timestamp(nowISO),at=timestamp(event.receivedAt),created=timestamp(event.messageAt);
 if(at>now||created>at||now-created>5*60000)return denial("EVENT_EXPIRED");
 const sender=phone(event.sender),mid=messageId(event.messageId),asset=providerId(event.phoneNumberId);
 const key=JSON.stringify([asset,mid]);
 if(list(seenMessageKeys,10000).includes(key))return denial("DUPLICATE_EVENT");
 if(event.kind!=="text"||typeof event.text!=="string"||event.text.length>80)return denial("UNSUPPORTED_COMMAND");
 const command=event.text.trim().toLowerCase();
 if(!own(COMMANDS,command))return denial("UNSUPPORTED_COMMAND");
 const candidates=list(bindings,1000).filter(b=>b&&b.phone===sender&&b.phoneNumberId===asset&&b.mode==="fixture"&&b.status==="active"&&b.revokedAt===null);
 if(!candidates.length)return denial("NO_ACTIVE_BINDING");
 // Never reveal candidate company IDs/names to the chat before proof.
 if(candidates.some(b=>!uuid(b.userId)||!uuid(b.tenantId)||!uuid(b.bindingId)||b.phoneVerified!==true||b.consent!==true))return denial("BINDING_INVALID");
 if(new Set(candidates.map(b=>b.userId)).size!==1||new Set(candidates.map(b=>b.tenantId)).size!==candidates.length||new Set(candidates.map(b=>b.bindingId)).size!==candidates.length)return denial("AMBIGUOUS_BINDING");
 // Always require explicit tenant selection in a secure authenticated portal, even for a single tenant.
 if(!proof||proof.mode!=="fixture"||proof.verifiedByTrustedPortal!==true||proof.mfaVerified!==true||proof.explicitTenantSelection!==true||proof.phone!==sender||proof.phoneNumberId!==asset||!uuid(proof.sessionId)||!uuid(proof.bindingId)||!uuid(proof.tenantId)||!uuid(proof.userId))return denial("PORTAL_AUTH_REQUIRED");
 const issued=timestamp(proof.issuedAt),expires=timestamp(proof.expiresAt),mfa=timestamp(proof.mfaAt);
 if(mfa>issued||issued>now||expires<=now||expires-issued>15*60000||now-mfa>15*60000||proof.revoked!==false)return denial("PORTAL_AUTH_EXPIRED");
 const matching=candidates.filter(b=>b.bindingId===proof.bindingId&&b.tenantId===proof.tenantId&&b.userId===proof.userId);
 if(matching.length!==1)return denial("TENANT_SELECTION_DENIED");
 const b=matching[0];
 if(b.role!=="owner"||b.membership!=="active"||b.tenantStatus!=="active"||b.executiveRead!==true)return denial("MEMBERSHIP_DENIED");
 const granted=list(b.domains,3);
 if(!granted.length||new Set(granted).size!==granted.length||!granted.every(d=>["commercial","finance","marketing"].includes(d)))return denial("DOMAIN_DENIED");
 const requested=COMMANDS[command],domains=requested==="all"?[...granted]:granted.includes(requested)?[requested]:[];
 if(!domains.length)return denial("DOMAIN_DENIED");
 return {mode:"fixture",decision:"simulate_read",allowExecutiveRead:true,allowCommercialFallback:false,dispatch:false,messageKey:key,
  actor:{tenantId:b.tenantId,userId:b.userId,mode:"fixture",role:"owner",membership:"active",tenantStatus:"active",mfaVerified:true,executiveRead:true,domains},
  channel:"executive_whatsapp",productionReady:false};
}

export function simulateExecutiveWhatsAppReply(input,current,previous,buildBriefing){
 const auth=authorizeExecutiveWhatsApp(input);
 if(auth.decision!=="simulate_read")return {authorization:auth,briefing:null,dispatch:false};
 if(typeof buildBriefing!=="function")fail("EXEC_WA_INVALID_BUILDER");
 const briefing=buildBriefing(auth.actor,current,previous,input.nowISO);
 if(!briefing||briefing.mode!=="fixture"||briefing.productionReady!==false||briefing.actionsEnabled!==false||briefing.externalModelEnabled!==false)fail("EXEC_WA_UNSAFE_BRIEFING");
 for(const key of ["facts","gaps","observations","recommendations"])if(!Array.isArray(briefing[key])||briefing[key].some(v=>!auth.actor.domains.includes(v?.domain)))fail("EXEC_WA_DOMAIN_LEAK");
 // No recipient address, actual message, network request, outbox or CRM record.
 return {authorization:auth,briefing,dispatch:false,commercialWrite:false,productionReady:false};
}
