#!/usr/bin/env python3
"""PR629: offline lifecycle marker gate. No database or destructive actions."""
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
AUDIT=Path("docs/security/api-v1-retention-clock-feasibility-20261123.json")
CANDIDATES=Path("docs/security/api-v1-retention-candidate-periods-20261123.json")
WORKBOOK=Path("docs/security/api-v1-retention-decision-workbook-20261122.json")
SCHEMA=Path("prisma/schema.prisma")
MIGRATION=Path("prisma/migrations/20261123170000_api_v1_lifecycle_clocks/migration.sql")
INTEGRATION=Path("lib/api-v1/integration-management.ts")
QUOTA=Path("lib/api-v1/prisma-credential-repository.ts")
DIAGNOSTIC=Path("lib/api-v1/diagnostic-delivery-state.ts")
CLOCKS=Path("lib/api-v1/lifecycle-clocks.ts")
STAGED={
 "api_v1_integrations":("disabledAt","disabled_at"),
 "api_v1_quota_buckets":("windowEnd","window_end"),
 "api_v1_idempotency_records":("completedAt","completed_at"),
 "api_v1_inbox_events":("finalizedAt","finalized_at"),
 "api_v1_outbox_events":("finalizedAt","finalized_at"),
}
def require(test,msg):
    if not test: raise ValueError(msg)
def prisma_models(schema):
    found={}
    for m in re.finditer(r"^model\s+(\w+)\s*\{(.*?)^\}",schema,re.M|re.S):
        body=m.group(2)
        table=re.search(r'@@map\("([^"]+)"\)',body)
        if table:
            fields=set(re.findall(r"^\s{2}([A-Za-z_]\w*)\s+[A-Za-z_][A-Za-z_0-9?]*(?:\[\])?",body,re.M))
            found[table.group(1)]={"name":m.group(1),"fields":fields,"body":body}
    return found
def verify(root=ROOT):
    audit=json.loads((root/AUDIT).read_text())
    candidates=json.loads((root/CANDIDATES).read_text())
    workbook=json.loads((root/WORKBOOK).read_text())
    models=prisma_models((root/SCHEMA).read_text())
    migration=(root/MIGRATION).read_text()
    require(audit.get("schema_version")==1
            and audit.get("status")=="BLOCKED_FOR_AUTOMATED_PURGE"
            and audit.get("current_schema_change")=="STAGED_ADDITIVE_NULLABLE_CLOCKS_NOT_DEPLOYED"
            and audit.get("automated_purge_authorized") is False
            and audit.get("production_release_authorized") is False
            and audit.get("legal_review_completed") is False
            and audit.get("all_retention_periods_unapproved") is True,
            "Schema markers are not authorized retention")
    require(candidates.get("state")=="DISCUSSION_DRAFT"
            and candidates.get("may_enable_cleanup") is False
            and workbook.get("retention_and_lgpd_approved") is False,
            "Legal/policy hold must not be changed")
    source={x["child_table"]:x for x in workbook["items"]}
    proposed={x["table"]:x for x in candidates["items"]}
    rows=audit.get("items")
    require(isinstance(rows,list) and len(rows)==10
            and len(source)==len(proposed)==10,
            "All ten retention categories required")
    seen=set()
    for row in rows:
        table=row.get("table")
        require(table in source and table in proposed and table not in seen
                and row.get("prisma_model")==models.get(table,{}).get("name"),
                "Missing or mismatched table: "+str(table))
        model=models[table]
        available=row.get("observed_prisma_fields")
        require(isinstance(available,list)
                and all(f in model["fields"] for f in available),
                "Old observed fields not in schema: "+table)
        require(row.get("legal_and_owner_approval")=="PENDING"
                and row.get("cleanup_authorized") is False,
                "Approval must remain pending for "+table)
        if table in STAGED:
            field,column=STAGED[table]
            require(row.get("technical_clock_state")=="SCHEMA_MARKER_STAGED_NO_ELIGIBILITY_AUTOMATION"
                    and row.get("missing_in_qa_baseline_fields")==[field]
                    and row.get("staged_nullable_clock_field")==field
                    and row.get("missing_recommended_prisma_fields")==[]
                    and field in model["fields"],
                    "Staged marker not modeled: "+table)
            require(re.search(r"^\s{2}"+field+r"\s+DateTime\?\s+@map\(\""+column+r"\"\)",
                              model["body"],re.M) is not None,
                    "Staged clock must remain optional: "+table)
            stmt='ALTER TABLE "'+table+'" ADD COLUMN IF NOT EXISTS "'+column+'" TIMESTAMP(3);'
            require(migration.count(stmt)==1,"Expected exactly one additive migration per clock")
        else:
            require(row.get("technical_clock_state") in
                    ("DERIVABLE_WITH_DEPENDENCY_GATES","CLOCK_RECORDED_POLICY_PENDING")
                    and row.get("missing_in_qa_baseline_fields")==[]
                    and row.get("missing_recommended_prisma_fields")==[],
                    "Unapproved unrelated clock state")
        seen.add(table)
    statements=[s.strip() for s in migration.splitlines()
                if s.strip() and not s.lstrip().startswith("--")]
    require(len(statements)==5
            and all(re.fullmatch(
                r'ALTER TABLE "api_v1_[a-z_]+" ADD COLUMN IF NOT EXISTS "[a-z_]+" TIMESTAMP\(3\);',
                x) for x in statements),"No destructive or extra SQL permitted")
    require(seen==set(source)
            and set(audit.get("blocked_missing_clock_tables",[]))==set(STAGED),
            "Five historical clock blockers must remain recorded")
    require("nextApiIntegrationDisabledAt(state, new Date())" in (root/INTEGRATION).read_text()
            and "windowEnd, consumed: 1" in (root/QUOTA).read_text()
            and "diagnosticOutboxFinalizedAt(nextState, now)" in (root/DIAGNOSTIC).read_text(),
            "Known status/limit writers must persist the applicable markers")
    clock=(root/CLOCKS).read_text()
    require("nextState !== 'simulated_success'" in clock
            and "nextStatus === 'disabled'" in clock
            and "start.getTime() + durationMs" in clock,
            "Active/retry/DLQ must not be considered finalized")
    return {"result":"PASS_OFFLINE_HOLD","tables_checked":10,
            "nullable_fields_staged":5,"cleanup_authorized":False,
            "production_release_authorized":False}
if __name__=="__main__":
    print(json.dumps(verify(),sort_keys=True))
