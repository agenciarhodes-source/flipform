#!/usr/bin/env python3
"""PR01 Phase 9: fail-closed retention/cascade release checkpoint, offline only.

This checker validates an exact ten-edge FK graph against a pending policy
manifest and a previously generated SQL FK inventory. A passing CI check
means risk detection is working: NEVER that migration or release is approved.
No database, network, customer data or credential is accessed.
"""
import argparse
import json
from pathlib import Path

EXPECTED_GRAPH = {
    "api_v1_integrations": "tenants",
    "api_v1_credentials": "api_v1_integrations",
    "tenant_entitlement_grants": "tenants",
    "api_v1_credential_audits": "tenants",
    "api_v1_quota_buckets": "api_v1_credentials",
    "api_v1_idempotency_records": "api_v1_integrations",
    "api_v1_inbox_events": "api_v1_idempotency_records",
    "api_v1_outbox_events": "api_v1_inbox_events",
    "api_v1_webhook_replays": "api_v1_integrations",
    "api_v1_delivery_attempts": "api_v1_outbox_events",
}
CRITICAL_HISTORY = {
    "api_v1_credential_audits": "security_audit_critical",
    "api_v1_delivery_attempts": "delivery_audit_critical",
}
EXPECTED_POLICY = {
    "schema_version": 1,
    "decision_status": "UNRESOLVED",
    "production_release_authorized": False,
    "approved_retention_periods": False,
    "legal_hold_policy_approved": False,
    "hard_delete_endpoint_authorized": False,
    "approval_reference": None,
    "privacy_review_required": True,
}

def _assert(condition, message):
    if not condition:
        raise ValueError(message)

def check_gate(policy, inventory):
    _assert(isinstance(policy, dict) and isinstance(inventory, dict),
            "Policy and FK inventory must be JSON objects")
    for key, expected in EXPECTED_POLICY.items():
        _assert(key in policy and type(policy[key]) is type(expected)
                and policy[key] == expected,
                f"Unreviewed policy or release authorization change: {key}")
    _assert(inventory.get("inventory_complete") is True
            and inventory.get("production_migration_authorized") is False,
            "FK inventory cannot be interpreted as release authorization")
    _assert(inventory.get("fk_count") == 10, "Expected exactly 10 FK relationships")
    decisions = policy.get("fk_decisions")
    edges = inventory.get("fk_edges")
    _assert(isinstance(decisions, list) and len(decisions) == 10,
            "All 10 pending decisions required")
    _assert(isinstance(edges, list) and len(edges) == 10,
            "All 10 generated FK edges required")

    decision_by_table = {}
    for item in decisions:
        _assert(isinstance(item, dict), "Invalid decision record")
        child = item.get("child_table")
        _assert(child in EXPECTED_GRAPH and child not in decision_by_table,
                "Duplicate or unexpected PR01 table in policy")
        _assert(item.get("parent_table") == EXPECTED_GRAPH[child],
                "Parent relationship differs from reviewed PR01 graph")
        _assert(item.get("expected_action") == "RESTRICT"
                and item.get("decision") == "PENDING",
                "Unreviewed FK action or policy decision")
        _assert(isinstance(item.get("category"), str)
                and isinstance(item.get("proposed_control"), str)
                and len(item["proposed_control"].strip()) >= 15,
                "Missing proposed control for FK")
        if child in CRITICAL_HISTORY:
            _assert(item["category"] == CRITICAL_HISTORY[child],
                    "Critical audit record cannot be reclassified")
        decision_by_table[child] = item
    _assert(set(decision_by_table) == set(EXPECTED_GRAPH),
            "Missing PR01 policy entry")

    found = {}
    constraints = set()
    for edge in edges:
        _assert(isinstance(edge, dict), "Invalid generated FK edge")
        child = edge.get("child_table")
        parent = edge.get("parent_table")
        constraint = edge.get("constraint")
        _assert(child in EXPECTED_GRAPH and child not in found
                and parent == EXPECTED_GRAPH[child],
                "Generated FK topology drifted from reviewed PR01 graph")
        _assert(edge.get("on_delete") == "RESTRICT",
                "Unreviewed FK delete action; regeneration and approval required")
        _assert(isinstance(constraint, str) and constraint.strip()
                and constraint not in constraints,
                "Duplicate/missing FK constraint name")
        _assert(isinstance(edge.get("child_columns"), list)
                and isinstance(edge.get("parent_columns"), list)
                and len(edge["child_columns"]) == len(edge["parent_columns"])
                and len(edge["child_columns"]) in (1, 2, 3),
                "Malformed FK columns")
        constraints.add(constraint)
        found[child] = edge
    _assert(set(found) == set(EXPECTED_GRAPH), "Missing generated FK")

    return {
        "phase": "PR01_PHASE_9",
        "risk_inventory_valid": True,
        "ci_test_passed": True,
        "production_release_authorized": False,
        "migration_authorized": False,
        "retention_policy_approved": False,
        "hard_delete_authorized": False,
        "decision_status": "UNRESOLVED",
        "fk_relationships_checked": 10,
        "restrict_edges_present": 10,
        "cascade_edges_still_present": 0,
        "pending_decisions": 10,
        "critical_audit_tables": sorted(CRITICAL_HISTORY),
        "release_blockers": [
            "Draft RESTRICT FKs block accidental parent deletes, but retention and legal hold remain unapproved",
            "Existing tenant/integration hard-delete functionality requires compatibility review",
            "Target database identity, staging migration, backup and rollback are not authorized",
            "Green CI means verified safeguards, NOT approval to enable or deploy",
        ],
        "requires_explicit_next_decision": True,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    parser.add_argument("--fk-report", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        result = check_gate(
            json.loads(Path(args.policy).read_text(encoding="utf-8")),
            json.loads(Path(args.fk_report).read_text(encoding="utf-8")),
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        Path(args.report).write_text(json.dumps({
            "risk_inventory_valid": False,
            "production_release_authorized": False,
            "error": str(exc),
        }, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("PR01 retention gate rejected unreviewed change") from None
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n",
                                 encoding="utf-8")
    print("PR01 retention review: 10 RESTRICT FKs, policy still pending; RELEASE BLOCKED")

if __name__ == "__main__":
    main()
