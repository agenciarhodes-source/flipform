import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pr01_retention_release_gate import check_gate, EXPECTED_GRAPH, CRITICAL_HISTORY

POLICY_PATH = ROOT / "docs/security/pr01-phase9-retention-decision-matrix.json"


def policy_fixture():
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def inventory_fixture():
    return {
        "inventory_complete": True,
        "production_migration_authorized": False,
        "fk_count": len(EXPECTED_GRAPH),
        "fk_edges": [
            {
                "child_table": child,
                "parent_table": parent,
                "constraint": "synthetic_" + str(i) + "_fk",
                "child_columns": ['"tenant_id"'],
                "parent_columns": ['"id"'],
                "on_delete": "RESTRICT",
            }
            for i, (child, parent) in enumerate(EXPECTED_GRAPH.items())
        ],
    }


class Phase9PolicyGateTests(unittest.TestCase):
    def test_all_ten_real_proposed_rules_remain_unapproved(self):
        result = check_gate(policy_fixture(), inventory_fixture())
        self.assertTrue(result["ci_test_passed"])
        self.assertEqual(result["restrict_edges_present"], 10)
        self.assertEqual(result["pending_decisions"], 10)
        self.assertFalse(result["production_release_authorized"])
        self.assertFalse(result["migration_authorized"])
        self.assertFalse(result["hard_delete_authorized"])
        self.assertEqual(set(result["critical_audit_tables"]), set(CRITICAL_HISTORY))

    def test_policy_flags_cannot_self_authorize_release(self):
        for field, altered in [
            ("decision_status", "APPROVED"),
            ("production_release_authorized", True),
            ("approved_retention_periods", True),
            ("legal_hold_policy_approved", True),
            ("hard_delete_endpoint_authorized", True),
            ("approval_reference", "self-approved"),
            ("privacy_review_required", False),
        ]:
            with self.subTest(field=field):
                p = policy_fixture()
                p[field] = altered
                with self.assertRaisesRegex(ValueError, "Unreviewed policy"):
                    check_gate(p, inventory_fixture())

    def test_all_decision_rows_are_required_and_pending(self):
        variants = []
        p = policy_fixture()
        p["fk_decisions"].pop()
        variants.append(p)
        p = policy_fixture()
        p["fk_decisions"][0]["decision"] = "APPROVED"
        variants.append(p)
        p = policy_fixture()
        p["fk_decisions"][0]["parent_table"] = "other"
        variants.append(p)
        p = policy_fixture()
        p["fk_decisions"][0]["expected_action"] = "CASCADE"
        variants.append(p)
        p = policy_fixture()
        p["fk_decisions"][-1] = copy.deepcopy(p["fk_decisions"][0])
        variants.append(p)
        p = policy_fixture()
        p["fk_decisions"][0]["proposed_control"] = ""
        variants.append(p)
        for item in variants:
            with self.subTest(variant=item["fk_decisions"]):
                with self.assertRaises(ValueError):
                    check_gate(item, inventory_fixture())

    def test_critical_audit_categories_may_not_be_downgraded(self):
        for name in CRITICAL_HISTORY:
            p = policy_fixture()
            entry = next(x for x in p["fk_decisions"] if x["child_table"] == name)
            entry["category"] = "normal"
            with self.subTest(table=name), self.assertRaisesRegex(
                ValueError, "Critical audit record"
            ):
                check_gate(p, inventory_fixture())

    def test_sql_graph_drift_and_unknown_deletion_policy_block(self):
        cases = []
        r = inventory_fixture()
        r["fk_edges"][0]["parent_table"] = "not_tenants"
        cases.append(r)
        r = inventory_fixture()
        r["fk_edges"][0]["on_delete"] = "SET NULL"
        cases.append(r)
        r = inventory_fixture()
        r["fk_edges"].pop()
        cases.append(r)
        r = inventory_fixture()
        r["fk_edges"][-1] = copy.deepcopy(r["fk_edges"][0])
        cases.append(r)
        r = inventory_fixture()
        r["fk_edges"][0]["constraint"] = ""
        cases.append(r)
        r = inventory_fixture()
        r["production_migration_authorized"] = True
        cases.append(r)
        for idx, case in enumerate(cases):
            with self.subTest(case=idx), self.assertRaises(ValueError):
                check_gate(policy_fixture(), case)


if __name__ == "__main__":
    unittest.main()
