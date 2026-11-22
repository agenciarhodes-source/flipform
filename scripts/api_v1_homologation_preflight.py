#!/usr/bin/env python3
"""Offline homologation preflight. A green job verifies NO-GO safeguards, NOT release readiness.

Never reads env secrets, connects to GitHub/Vercel/Neon, deploys, migrates, or queries customers.
The external observations are a dated snapshot, not continuous runtime attestation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from pr01_staging_no_go_gate import check_no_go

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/security/api-v1-homologation-evidence-20261121.json"
PR01_HOLD = ROOT / "docs/security/pr01-staging-release-gates-DRAFT.json"
RETENTION = ROOT / "docs/security/pr01-phase9-retention-decision-matrix.json"
PROPOSAL = ROOT / "docs/security/api-v1-retention-decision-workbook-20261122.json"
VERCEL = ROOT / "vercel.json"
BRANCH = "security/api-v1-homologation-20261121"

ROUTES = {
    "app/api/v1/capabilities/route.ts": "integrations.read",
    "app/api/v1/pipelines/route.ts": "pipelines.read",
    "app/api/v1/pipelines/[pipelineId]/metrics/route.ts": "pipelines.metrics.read",
    "app/api/v1/forms/route.ts": "forms.read",
    "app/api/v1/forms/[formId]/fields/route.ts": "forms.read",
    "app/api/v1/leads/route.ts": "leads.metadata.read",
    "app/api/v1/leads/[leadId]/route.ts": "leads.metadata.read",
}
FALSE_FLAGS = (
    "not_authorization", "staging_deployment_authorized",
    "production_deployment_authorized", "neon_migration_authorized",
    "enable_api_authorized", "activate_maintenance_workflows_authorized",
)
NOT_ATTESTED = {
    "runtime_db_identity": "NOT_ATTESTED",
    "staging_outbound_egress": "NOT_ATTESTED",
    "restore_and_rollback_of_current_schema": "NOT_ATTESTED",
    "two_tenant_staging_regression": "NOT_RUN",
    "separate_release_authorization": "NOT_GRANTED",
    "production_api_enablement": "NOT_AUTHORIZED",
}

def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Expected JSON object: " + str(path.name))
    return value

def require(test: bool, message: str) -> None:
    if not test:
        raise ValueError(message)

def verify(root: Path = ROOT) -> dict:
    evidence = load(root / EVIDENCE.relative_to(ROOT))
    manifest = load(root / PR01_HOLD.relative_to(ROOT))
    retention = load(root / RETENTION.relative_to(ROOT))
    proposal = load(root / PROPOSAL.relative_to(ROOT))
    vercel = load(root / VERCEL.relative_to(ROOT))
    require(evidence.get("schema_version") == 1 and evidence.get("decision") == "NO_GO",
            "Homologation evidence must remain a dated NO_GO snapshot")
    for field in FALSE_FLAGS:
        expected = True if field == "not_authorization" else False
        require(evidence.get(field) is expected, "Unreviewed release claim: " + field)
    require(evidence.get("as_of") == "2026-11-21", "Dated evidence changed without a new audit")
    gates = evidence.get("gates", {})
    require(isinstance(gates, dict), "Malformed gates")
    require(gates.get("ci_pr01_and_pr02") == "PASS", "Expected existing green CI evidence")
    require(gates.get("baseline_staging_schema") == "BLOCKED_EMPTY_DATABASE",
            "Must not claim staging database already bootstrapped")
    require(gates.get("staging_deploy_matches_pr02") == "BLOCKED_NOT_DEPLOYED",
            "Must not claim current PR02 code is running in staging")
    require(gates.get("privacy_and_retention") == "BLOCKED_DECISION_UNRESOLVED",
            "Unapproved privacy policy cannot be treated as complete")
    for key, value in NOT_ATTESTED.items():
        require(gates.get(key) == value, "Unsupported staging/production attestation: " + key)
    source = evidence.get("sources", {})
    require(isinstance(source, dict), "Malformed evidence sources")
    neon = source.get("neon_staging", {})
    vercel_staging = source.get("vercel_staging", {})
    github = source.get("github", {})
    require(neon.get("project_name") == "flipform-staging-isolated"
            and neon.get("database_name") == "flipform_staging"
            and neon.get("observed_public_table_count") == 0
            and neon.get("observed_api_v1_table_count") == 0,
            "Dated read-only staging evidence misrepresented")
    lab = neon.get("homologation_lab", {})
    require(lab.get("project_id") == "holy-fog-36254823"
            and lab.get("parent_branch_id") == "br-icy-glitter-bcisq63l"
            and lab.get("branch_id") == "br-nameless-art-bc6k4c5g"
            and lab.get("branch_name") == "api-v1-pr629-homologation-lab-20261121"
            and lab.get("verified_state") == "ready"
            and lab.get("created_without_compute") is True
            and lab.get("schema_applied") is False
            and lab.get("application_deployed") is False
            and lab.get("is_default") is False,
            "Lab branch evidence cannot be interpreted as schema/bootstrap completion")
    qa = neon.get("full_schema_qa_lab", {})
    require(qa.get("project_id") == "holy-fog-36254823"
            and qa.get("branch_id") == "br-snowy-band-bcb0auy6"
            and qa.get("source_parent_branch_id") == "br-rough-bread-bc1ulrnc"
            and qa.get("database_name") == "flipform_staging"
            and qa.get("baseline_tables_verified") == 92
            and qa.get("current_total_public_tables") == 102
            and qa.get("api_tables_added") == 10
            and qa.get("api_foreign_keys") == 10
            and qa.get("api_foreign_keys_on_delete_restrict") == 10
            and qa.get("api_foreign_keys_on_delete_cascade") == 0
            and qa.get("current_tenants") == 0 and qa.get("current_leads") == 0
            and qa.get("current_api_credentials") == 0
            and qa.get("structural_postgresql_catalog_checked") is True
            and qa.get("byte_identical_migration_artifact_applied") is False
            and qa.get("end_to_end_deployed_app_tested") is False
            and qa.get("backup_restore_with_current_schema_proved") is False
            and qa.get("staging_default_branch_modified") is False
            and qa.get("production_project_modified") is False,
            "QA lab schema rehearsal cannot be confused with staging production readiness")
    require(gates.get("isolated_schema_rehearsal") == "PASS_STRUCTURAL_ONLY",
            "Lab schema rehearsal does not attest runtime or production release")
    require(neon.get("application_runtime_database_identity_attested") is False
            and neon.get("backup_restore_test_on_application_schema_completed") is False,
            "Missing app runtime/restore evidence")
    require(vercel_staging.get("project_name") == "flipform-staging"
            and vercel_staging.get("current_pr02_commit_deployed") is False
            and vercel_staging.get("secret_values_read") is False
            and vercel_staging.get("runtime_database_host_verified") is False
            and vercel_staging.get("deployed_api_v1_staging_routes_tested") is False
            and vercel_staging.get("egress_isolation_tested") is False,
            "Vercel staging claims exceed actual read-only evidence")
    require(github.get("pr01_draft") is True and github.get("pr02_draft") is True
            and github.get("pr00_draft") is True,
            "PR approvals cannot be inferred from passing CI")
    require(github.get("pr02_based_on") == "feature/pr01-global-api-foundation",
            "PR02 stacking order changed")
    require(proposal.get("schema_version") == 1
            and proposal.get("state") == "PROPOSAL_ONLY"
            and proposal.get("decision") == "NO_GO"
            and proposal.get("review_status") == "PENDING_REVIEW",
            "Retention workbook must remain an unapproved proposal")
    for key in ("production_release_authorized", "retention_and_lgpd_approved",
                "legal_hold_policy_approved", "hard_delete_endpoint_authorized"):
        require(proposal.get(key) is False, "Retention proposal cannot authorize: " + key)
    for key in ("approved_by", "approval_reference", "approved_at"):
        require(proposal.get(key) is None, "Retention proposal cannot contain approval: " + key)
    proposed_items = proposal.get("items")
    source_items = retention.get("fk_decisions", [])
    require(isinstance(proposed_items, list) and len(proposed_items) == 10,
            "Retention workbook must cover exactly ten relationships")
    known = {(x.get("child_table"), x.get("parent_table"), x.get("category"))
             for x in source_items}
    actual = set()
    for item in proposed_items:
        require(isinstance(item, dict), "Malformed proposal item")
        link = (item.get("child_table"), item.get("parent_table"), item.get("category"))
        require(link in known and link not in actual
                and item.get("foreign_key_action") == "RESTRICT"
                and item.get("existing_source_decision") == "PENDING"
                and item.get("decision") == "PENDING",
                "Unreviewed or mismatched retention item")
        for field in ("retention_period", "retention_period_unit", "lawful_basis",
                      "legal_hold_rule", "data_subject_request_handling",
                      "owner_for_approval", "decision_reference"):
            require(item.get(field) is None,
                    "Unapproved retention value must not be treated as final: " + field)
        for field in ("processing_purpose", "data_minimization_proposal",
                      "retention_start_event_proposal", "deletion_or_anonymization_proposal",
                      "technical_dependencies"):
            require(isinstance(item.get(field), str) and len(item[field].strip()) > 15,
                    "Incomplete proposal rationale: " + field)
        actual.add(link)
    require(len(actual) == 10 and len(known) == 10,
            "Retention proposal is missing source-matrix decisions")
    check_no_go(manifest, vercel, retention)
    require(vercel.get("git", {}).get("deploymentEnabled", {}).get(BRANCH) is False,
            "Automatic deployment must be disabled for this homologation PR")
    for path, scope in ROUTES.items():
        route = root / path
        require(route.is_file(), "Missing API route: " + path)
        text = route.read_text(encoding="utf-8")
        require("apiV1Enabled(process.env)" in text
                and "authorizeApiV1Request({" in text
                and "scope: '" + scope + "'" in text,
                "Missing disabled-by-default scoped M2M authorization: " + path)
    # Names or tokens from a secret value must never be embedded in this evidence.
    raw = json.dumps(evidence)
    require("postgresql://" not in raw and "Bearer ffv1." not in raw,
            "Do not include credential values or DB connection strings in audit evidence")
    return {
        "preflight_checks_passed": True,
        "meaning": "NO_GO hold intact; neither runtime staging acceptance nor release approval",
        "decision": "NO_GO",
        "staging_schema_ready": False,
        "staging_pr02_deployed": False,
        "production_release_authorized": False,
        "api_activation_authorized": False,
        "routes_scoped_checked": len(ROUTES),
        "pending_fk_retention_decisions": len(retention["fk_decisions"]),
        "external_snapshot_date": evidence["as_of"],
        "requires_separate_approved_staging_actions": True,
    }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = verify()
    except (ValueError, TypeError, KeyError, OSError, json.JSONDecodeError) as exc:
        result = {"preflight_checks_passed": False, "decision": "NO_GO",
                  "production_release_authorized": False, "error": str(exc)}
        args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("Homologation hold preflight FAILED: " + str(exc)) from None
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("Homologation preflight PASS: release NO_GO is intact; no staging or production operation executed.")

if __name__ == "__main__":
    main()
