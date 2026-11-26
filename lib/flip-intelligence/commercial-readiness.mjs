/** PR-M — immutable current NO-GO inventory and synthetic release checklist. */
const FEATURES={"universal_connections":{"stage":"B","plan":null,"blockers":["trusted_connector_runtime","provider_account_verification","credential_rotation_revocation","sandbox_e2e"]},"data_hub":{"stage":"C","plan":null,"blockers":["durable_real_ingestion","schema_and_migration_rehearsal","reconciliation_coverage","retention_approval"]},"flip_ads_reporting":{"stage":"D/F","plan":"premium-pro","blockers":["provider_oauth_and_transport","verified_reporting_coverage","account_scope_e2e"]},"flip_ads_campaigns":{"stage":"E","plan":"premium-pro","blockers":["authenticated_ui_api","postgres_concurrency_e2e","provider_policy_validation","publication_approval_and_transport"]},"organic_reporting":{"stage":"G","plan":null,"blockers":["google_oauth_and_transport","provider_data_use_review","verified_reporting_coverage"]},"enterprise_data":{"stage":"H","plan":null,"blockers":["erp_crm_adapter_selection","live_adapters_and_storage","reconciliation_coverage"]},"flip_intelligence":{"stage":"I","plan":null,"blockers":["verified_real_sources","authenticated_dashboard","native_pipeline_metrics","forecast_validation"]},"executive_advice":{"stage":"J","plan":null,"blockers":["trusted_session_and_entitlements","verified_real_sources","approved_model_integration","grounded_output_validation"]},"executive_whatsapp":{"stage":"K","plan":null,"blockers":["dedicated_asset_and_router","durable_binding_and_mfa","isolated_outbox_and_idempotency","authorized_message_e2e"]},"executive_proactivity":{"stage":"L","plan":null,"blockers":["durable_scheduler_and_outbox","approved_templates_and_consent","atomic_budget_and_quota","authorized_calendar_e2e","executive_voice_provider_e2e"]}};
const COMMON=["full_ci_exact_commit","two_tenant_security_e2e","isolated_staging_attestation","backup_restore_rehearsal","data_retention_and_privacy_approval","operator_release_approval","production_rollback_plan"];
function fail(code){throw Error(code);}

function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

function uuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);}

function sha(v){return typeof v==="string"&&/^[0-9a-f]{40}$/.test(v);}

function int(v){return Number.isSafeInteger(v)&&v>=0;}

function stamp(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.parse(v)).toISOString()!==v)fail("RELEASE_TIME_INVALID");return Date.parse(v);}

function validateContext(input){
 const a=input?.actor;
 if(input?.mode!=="fixture"||!a||a.mode!=="fixture"||!uuid(a.tenantId)||!uuid(a.userId)||!sha(input.commit)||!own(FEATURES,input.feature))fail("RELEASE_CONTEXT_INVALID");
 return {a,f:FEATURES[input.feature],now:stamp(input.nowISO)};
}

export function readinessInventory(){
 return Object.entries(FEATURES).map(([feature,f])=>({feature,stage:f.stage,planRule:f.plan,commercialPlanDefined:f.plan!==null,status:"not_released",implementationBlockers:[...f.blockers],commonEvidence:[...COMMON]}));
}

export function evaluateCommercialReadiness(input){
 const {a,f,now}=validateContext(input),reasons=[];
 if(a.role!=="owner"||a.membership!=="active"||a.tenantStatus!=="active"||a.mfaVerified!==true)reasons.push("OWNER_AUTH_REQUIRED");
 if(a.planActive!==true||a.subscriptionStatus!=="active")reasons.push("ACTIVE_SUBSCRIPTION_REQUIRED");
 if(f.plan===null)reasons.push("COMMERCIAL_PLAN_UNDEFINED");
 else if(a.planSlug!==f.plan)reasons.push("PLAN_NOT_ENTITLED");
 if(!Array.isArray(input.pilotTenantIds)||input.pilotTenantIds.length>10||!input.pilotTenantIds.every(uuid)||new Set(input.pilotTenantIds).size!==input.pilotTenantIds.length||!input.pilotTenantIds.includes(a.tenantId)||input.pilotEnabled!==true)reasons.push("PILOT_NOT_AUTHORIZED");
 const b=input.budget;
 if(!b||b.mode!=="fixture"||b.tenantId!==a.tenantId||b.feature!==input.feature||b.currency!=="USD"||b.verified!==true||!int(b.monthlyLimitMicros)||!int(b.reservedMicros)||!int(b.nextMaxCostMicros)||b.monthlyLimitMicros===0||b.nextMaxCostMicros===0||!int(b.reservedMicros+b.nextMaxCostMicros)||b.reservedMicros+b.nextMaxCostMicros>b.monthlyLimitMicros||stamp(b.expiresAt)<=now)reasons.push("BUDGET_NOT_VERIFIED");
 const expected=[...COMMON,...f.blockers];
 const receipts=input.evidence;
 if(!Array.isArray(receipts)||receipts.length>expected.length)fail("RELEASE_EVIDENCE_INVALID");
 const byKey=new Map();
 for(const e of receipts){
  if(!e||!expected.includes(e.key)||byKey.has(e.key)||e.mode!=="fixture"||e.tenantId!==a.tenantId||e.feature!==input.feature||e.commit!==input.commit||e.environment!=="isolated_staging"||!["pass","fail","pending"].includes(e.status)||!uuid(e.receiptId))fail("RELEASE_EVIDENCE_INVALID");
  const observed=stamp(e.observedAt);
  if(observed>now)fail("RELEASE_EVIDENCE_INVALID");
  byKey.set(e.key,e);
 }
 const missing=expected.filter(k=>{const e=byKey.get(k);return !e||e.status!=="pass"||now-stamp(e.observedAt)>7*86400000;});
 if(missing.length)reasons.push("EVIDENCE_INCOMPLETE");
 // Even a complete synthetic checklist cannot promote a fixture or enable any production capability.
 return {version:1,mode:"fixture",feature:input.feature,commit:input.commit,decision:"NO_GO",syntheticChecklistComplete:reasons.length===0,reasons:[...reasons,"IMPLEMENTATION_AND_LIVE_EVIDENCE_REQUIRED"],missingEvidence:missing,productionReady:false,activationAuthorized:false,dispatchAuthorized:false,billingChangeAuthorized:false,automaticMergeAuthorized:false};
}
