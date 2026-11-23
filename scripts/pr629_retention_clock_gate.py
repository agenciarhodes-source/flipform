#!/usr/bin/env python3
"""Offline PR629 retention clock gate. No database connections or destructive actions."""
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
AUDIT=Path("docs/security/api-v1-retention-clock-feasibility-20261123.json")
CANDIDATES=Path("docs/security/api-v1-retention-candidate-periods-20261123.json")
WORKBOOK=Path("docs/security/api-v1-retention-decision-workbook-20261122.json")
SCHEMA=Path("prisma/schema.prisma")
BLOCKED={
 "api_v1_integrations":"disabledAt",
 "api_v1_quota_buckets":"windowEnd",
 "api_v1_idempotency_records":"completedAt",
 "api_v1_inbox_events":"finalizedAt",
 "api_v1_outbox_events":"finalizedAt",
}
def require(ok, why):
    if not ok: raise ValueError(why)
def prisma_models(schema):
    found={}
    for match in re.finditer(r"^model\s+(\w+)\s*\{(.*?)^\}",schema,re.M|re.S):
        body=match.group(2)
        name=match.group(1)
        table=re.search(r'@@map\("([^"]+)"\)',body)
        if not table: continue
        fields=set(re.findall(r"^\s{2}([A-Za-z_]\w*)\s+[A-Za-z_][A-Za-z_0-9?]*(?:\[\])?",body,re.M))
        found[table.group(1)]={"name":name,"fields":fields}
    return found
def verify(root=ROOT):
    audit=json.loads((root/AUDIT).read_text())
    candidates=json.loads((root/CANDIDATES).read_text())
    workbook=json.loads((root/WORKBOOK).read_text())
    models=prisma_models((root/SCHEMA).read_text())
    require(audit.get("schema_version")==1
            and audit.get("status")=="BLOCKED_FOR_AUTOMATED_PURGE"
            and audit.get("production_release_authorized") is False
            and audit.get("automated_purge_authorized") is False
            and audit.get("legal_review_completed") is False
            and audit.get("all_retention_periods_unapproved") is True,
            "Retention clock report is not an approval or pruning authorization")
    require(candidates.get("state")=="DISCUSSION_DRAFT"
            and candidates.get("may_enable_cleanup") is False
            and workbook.get("retention_and_lgpd_approved") is False,
            "Clock report cannot circumvent retention or legal hold decisions")
    source={i["child_table"]:i for i in workbook["items"]}
    proposed={i["table"]:i for i in candidates["items"]}
    rows=audit.get("items")
    require(isinstance(rows,list) and len(rows)==10
            and len(source)==len(proposed)==10,"Clock report must cover 10 tables")
    seen=set()
    blocked=set()
    for row in rows:
        table=row.get("table")
        require(table in source and table in proposed and table not in seen
                and row.get("prisma_model")==models.get(table,{}).get("name"),
                "Retention clock table/model mismatch: "+str(table))
        fields=models[table]["fields"]
        available=row.get("observed_prisma_fields")
        missing=row.get("missing_recommended_prisma_fields")
        require(isinstance(available,list) and all(f in fields for f in available)
                and isinstance(missing,list) and all(f not in fields for f in missing),
                "Retention clocks do not match actual Prisma schema: "+table)
        require(row.get("legal_and_owner_approval")=="PENDING"
                and row.get("cleanup_authorized") is False
                and len(row.get("technical_precondition",""))>=25,
                "Cannot approve retention purge from schema feasibility assessment")
        state=row.get("technical_clock_state")
        if table in BLOCKED:
            blocked.add(table)
            require(state=="BLOCKED_MISSING_EVENT_CLOCK"
                    and missing==[BLOCKED[table]],
                    "Missing event timestamp must block retention purge: "+table)
        else:
            require(state in ("DERIVABLE_WITH_DEPENDENCY_GATES",
                              "CLOCK_RECORDED_POLICY_PENDING")
                    and missing==[],"Invalid conditional retention clock: "+table)
        seen.add(table)
    require(seen==set(source) and blocked==set(BLOCKED)
            and set(audit.get("blocked_missing_clock_tables",[]))==set(BLOCKED),
            "Incomplete or falsely cleared lifecycle clock blockers")
    return {"result":"PASS_OFFLINE_HOLD","tables_checked":len(seen),
            "clock_blockers":len(blocked),"automated_purge_authorized":False,
            "production_release_authorized":False}
if __name__=="__main__":
    print(json.dumps(verify(),sort_keys=True))
