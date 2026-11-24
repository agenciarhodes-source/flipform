#!/usr/bin/env python3
"""Validate owner operational acceptance without conflating it with technical or production signoff."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RECORD=Path("docs/security/api-v1-operational-owner-acceptance-20261123.json")
HOLD=Path("docs/security/pr01-staging-release-gates-DRAFT.json")
RETENTION=Path("docs/security/api-v1-retention-decision-workbook-20261122.json")

def require(ok,reason):
    if not ok: raise ValueError(reason)

def verify(root=ROOT):
    record=json.loads((root/RECORD).read_text())
    hold=json.loads((root/HOLD).read_text())
    retention=json.loads((root/RETENTION).read_text())
    require(record.get("schema_version")==1 and record.get("recorded_at")=="2026-11-23"
            and record.get("owner_operational_acceptance")=="DECLARED"
            and record.get("acceptance_kind")=="OWNER_BUSINESS_ACCEPTANCE_NOT_TECHNICAL_ATTESTATION",
            "Owner acceptance must remain bounded to business responsibility")
    require(record.get("operational_technical_completion")=="INCOMPLETE"
            and record.get("operational_risk_assessment")=="OPEN"
            and record.get("release_authorization")=="NOT_GRANTED",
            "Business acceptance cannot be falsely promoted to operational readiness")
    for key in ("numeric_rpo_rto_approved","timestamp_lsn_pitr_restoration_verified",
                "comprehensive_runtime_egress_attested",
                "lgpd_retention_and_legal_hold_approved","merge_authorized",
                "production_migration_authorized","production_deployment_authorized",
                "api_activation_authorized","api_pilot_with_customer_data_authorized",
                "maintenance_workflow_reenablement_authorized","retention_purge_authorized"):
        require(record.get(key) is False,"Unsupported operational authorization: "+key)
    for key in ("numeric_rpo_target_minutes","numeric_rto_target_minutes"):
        require(record.get(key) is None, "No numeric objective was declared: "+key)
    flag=record.get("live_preview_flags_snapshot",{})
    expected={"FLIPFORM_API_V1_ENABLED":"false",
              "PR629_BLOCK_EXTERNAL_EGRESS":"true",
              "EMAIL_PROVIDER":"none","MAINTENANCE_GATE":"disabled"}
    require(flag.get("nonsecret_flags")==expected
            and flag.get("decrypted_sensitive_values_read") is False
            and flag.get("general_network_firewall_verified") is False,
            "Protected preview configuration cannot imply complete egress attestation")
    require(record.get("snapshot_restore_current_api_schema_verified_in_isolated_lab") is True
            and record.get("narrow_preview_external_transports_guarded") is True
            and len(record.get("unresolved_issues",[]))>=5,
            "Do not discard residual operational risk evidence")
    require(hold.get("decision")=="NO_GO"
            and hold.get("production_release_authorized") is False
            and hold.get("retention_and_lgpd_approved") is False
            and hold.get("staging_egress_isolation_attested") is False
            and hold.get("production_rollback_plan_approved") is False,
            "Operational owner acceptance must not override API release gates")
    require(retention.get("decision")=="NO_GO"
            and retention.get("retention_and_lgpd_approved") is False
            and all(x.get("decision")=="PENDING" for x in retention["items"])
            and len(retention["items"])==10,
            "Retention approval not yet declared")
    return {"result":"PASS_OWNER_ACCEPTANCE_RECORDED",
            "technical_operational_readiness":"INCOMPLETE","release":"NO_GO"}
if __name__=="__main__":
    print(json.dumps(verify(),sort_keys=True))
