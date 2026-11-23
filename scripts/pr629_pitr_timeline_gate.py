#!/usr/bin/env python3
"""PR629: immutable evidence of historical schema access without false PITR attestation."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=Path("docs/security/api-v1-pitr-timeline-readonly-20261123.json")
OPERATION=Path("docs/security/api-v1-operational-owner-acceptance-20261123.json")
GATES=Path("docs/security/pr01-staging-release-gates-DRAFT.json")
def need(value,message):
    if not value: raise ValueError(message)
def verify(root=ROOT):
    p=json.loads((root/EVIDENCE).read_text())
    op=json.loads((root/OPERATION).read_text())
    g=json.loads((root/GATES).read_text())
    need(p.get("schema_version")==1
         and p.get("history_schema_query")=="PASS_HISTORICAL_SCHEMA_DIFF"
         and p.get("project_id")=="holy-fog-36254823"
         and p.get("isolated_non_default_root_branch")=="br-rapid-cherry-bcizfy2x"
         and p.get("database_name")=="flipform_staging",
         "Evidence must refer to isolated QA history, not production")
    first=p.get("original_schema_at_early_timestamp",{})
    second=p.get("post_schema_timestamp",{})
    need(first.get("point")=="2026-11-23T01:50:00Z"
         and first.get("added_tables_in_diff")==102
         and first.get("added_enums_in_diff")==10
         and first.get("historical_schema_diff_vs_current_bytes")==232785
         and first.get("view_verified") is True,
         "Unverified early historical diff")
    need(second.get("point")=="2026-11-23T02:06:00Z"
         and second.get("historical_schema_diff_vs_current_bytes")==0
         and second.get("view_verified") is True
         and p.get("latest_schema_public_tables")==102,
         "Historical post-DDL state not verified")
    need(p.get("isolated_root_creation_result")=="BLOCKED_LIMIT"
         and p.get("count_root_branches_at_observation")==5
         and "root branches limit exceeded" in p.get("isolated_root_creation_failure",""),
         "Root branch creation blockage must not be silently hidden")
    for field in (
      "native_timestamp_pitr_restore_executed",
      "point_in_time_restore_data_integrity_verified",
      "numeric_rpo_measured","numeric_rto_measured",
      "target_branch_replaced","default_branch_touched",
      "production_project_touched","customer_data_accessed","delete_branch_executed",
    ):
        need(p.get(field) is False, "PITR historic evidence cannot attest: "+field)
    need(p.get("snapshot_restore_current_schema_verified_separately") is True
         and p.get("release_gate")=="NO_GO"
         and p.get("owner_operational_acceptance_recorded") is True,
         "No change to production approval permitted")
    need(op.get("owner_operational_acceptance")=="DECLARED"
         and op.get("timestamp_lsn_pitr_restoration_verified") is False
         and op.get("release_authorization")=="NOT_GRANTED"
         and g.get("decision")=="NO_GO"
         and g.get("production_release_authorized") is False,
         "Operational acceptance cannot imply native PITR or release")
    return {"result":"PASS_HISTORY_EVIDENCE_ONLY","native_pitr_completed":False,"release":"NO_GO"}
if __name__=="__main__":print(json.dumps(verify(),sort_keys=True))
