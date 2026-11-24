#!/usr/bin/env python3
"""PR01: offline staging/release NO-GO gate. Never contacts Vercel, GitHub, Neon or a database.

A passing check proves that deployment is still BLOCKED, not that staging or
production can be used. Changes to approvals require independent review.
"""
import argparse
import json
from pathlib import Path

EXPECTED_HOLD = {
    "schema_version": 1,
    "pr_number": 627,
    "head_branch": "feature/pr01-global-api-foundation",
    "decision": "NO_GO",
    "production_release_authorized": False,
    "staging_deployment_authorized": False,
    "neon_migration_authorized": False,
    "api_activation_authorized": False,
    "retention_and_lgpd_approved": False,
    "legal_hold_approved": False,
    "runtime_db_identity_attested": False,
    "staging_egress_isolation_attested": False,
    "staging_backup_restore_accepted": False,
    "staging_tenant_ab_regressions_accepted": False,
    "production_rollback_plan_approved": False,
    "release_approval_reference": None,
}
PR01_BRANCH = EXPECTED_HOLD["head_branch"]
EXPECTED_POLICY_TABLES = {
    "api_v1_integrations", "api_v1_credentials", "tenant_entitlement_grants",
    "api_v1_credential_audits", "api_v1_quota_buckets",
    "api_v1_idempotency_records", "api_v1_inbox_events",
    "api_v1_outbox_events", "api_v1_webhook_replays",
    "api_v1_delivery_attempts",
}

def check_no_go(manifest, vercel, retention):
    if not all(isinstance(item, dict) for item in (manifest, vercel, retention)):
        raise ValueError("Invalid PR01 no-go input")
    for key, expected in EXPECTED_HOLD.items():
        if key not in manifest or type(manifest[key]) is not type(expected) or manifest[key] != expected:
            raise ValueError("PR01 authorization changed without independent review: " + key)
    deployments = vercel.get("git", {}).get("deploymentEnabled", {})
    if not isinstance(deployments, dict) or deployments.get(PR01_BRANCH) is not False:
        raise ValueError("PR01 automatic Preview must remain disabled in vercel.json")
    for key, value in (
        ("decision_status", "UNRESOLVED"),
        ("production_release_authorized", False),
        ("approved_retention_periods", False),
        ("legal_hold_policy_approved", False),
        ("hard_delete_endpoint_authorized", False),
        ("privacy_review_required", True),
        ("approval_reference", None),
    ):
        if key not in retention or type(retention[key]) is not type(value) or retention[key] != value:
            raise ValueError("Retention gate changed without review: " + key)
    decisions = retention.get("fk_decisions")
    if not isinstance(decisions, list) or len(decisions) != 10:
        raise ValueError("All ten PR01 FK decisions must stay pending")
    children = set()
    for row in decisions:
        if not isinstance(row, dict):
            raise ValueError("Malformed PR01 FK decision")
        child = row.get("child_table")
        if child in children or child not in EXPECTED_POLICY_TABLES:
            raise ValueError("Unknown or duplicate FK child")
        if row.get("decision") != "PENDING" or row.get("expected_action") != "RESTRICT":
            raise ValueError("Retention choice changed without approval")
        children.add(child)
    if children != EXPECTED_POLICY_TABLES:
        raise ValueError("Missing PR01 FK decision")
    return {
        "phase": "PR01_STAGING_READINESS",
        "ci_check_passed": True,
        "meaning": "NO_GO controls still enforced; NOT a staging or production certification",
        "production_release_authorized": False,
        "staging_deployment_authorized": False,
        "neon_migration_authorized": False,
        "api_activation_authorized": False,
        "pr01_auto_preview_disabled": True,
        "pending_fk_decisions": 10,
        "outstanding_gates": [
            "Approve lawful retention, minimization, privacy requests and legal hold",
            "Verify runtime DB identity in isolated staging, not only Vercel build READY",
            "Attest external egress and isolate integrations, jobs and webhooks",
            "Approve isolated staging migration, backup/restore, A/B regressions and rollback",
            "Review PR00 dependencies and obtain explicit separate go/no-go authorization",
        ],
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--vercel", required=True)
    parser.add_argument("--retention", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        result = check_no_go(
            json.loads(Path(args.manifest).read_text(encoding="utf-8")),
            json.loads(Path(args.vercel).read_text(encoding="utf-8")),
            json.loads(Path(args.retention).read_text(encoding="utf-8")),
        )
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        Path(args.report).write_text(json.dumps({
            "ci_check_passed": False,
            "production_release_authorized": False,
            "staging_deployment_authorized": False,
            "reason": str(error),
        }, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("PR01 staging NO-GO guard failed") from None
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PR01 NO-GO intact: publication and Neon migrations remain BLOCKED")

if __name__ == "__main__":
    main()
