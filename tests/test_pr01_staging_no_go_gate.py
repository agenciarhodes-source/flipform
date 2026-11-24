"""Offline regression tests for staging NO-GO. Never load credentials or access networks."""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pr01_staging_no_go_gate import check_no_go, EXPECTED_HOLD

def fixtures():
    return (
        json.loads((ROOT / "docs/security/pr01-staging-release-gates-DRAFT.json").read_text()),
        json.loads((ROOT / "vercel.json").read_text()),
        json.loads((ROOT / "docs/security/pr01-phase9-retention-decision-matrix.json").read_text()),
    )

class Pr01StagingNoGoGateTest(unittest.TestCase):
    def test_draft_gate_means_no_release(self):
        m, v, p = fixtures()
        result = check_no_go(m, v, p)
        self.assertTrue(result["ci_check_passed"])
        self.assertTrue(result["pr01_auto_preview_disabled"])
        self.assertEqual(result["pending_fk_decisions"], 10)
        self.assertFalse(result["production_release_authorized"])
        self.assertFalse(result["staging_deployment_authorized"])
        self.assertFalse(result["neon_migration_authorized"])
        self.assertFalse(result["api_activation_authorized"])

    def test_no_approval_can_be_silently_self_granted(self):
        m, v, p = fixtures()
        variants = {
            "staging_deployment_authorized": True,
            "runtime_db_identity_attested": True,
            "staging_egress_isolation_attested": True,
            "retention_and_lgpd_approved": True,
            "legal_hold_approved": True,
            "neon_migration_authorized": True,
            "production_release_authorized": True,
            "staging_backup_restore_accepted": True,
            "staging_tenant_ab_regressions_accepted": True,
            "production_rollback_plan_approved": True,
            "api_activation_authorized": True,
            "decision": "GO",
            "release_approval_reference": "self-certified",
        }
        for key, value in variants.items():
            changed = copy.deepcopy(m)
            changed[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "independent review"):
                check_no_go(changed, v, p)

    def test_preview_reenable_is_rejected(self):
        m, v, p = fixtures()
        for new_value in (True, None):
            changed = copy.deepcopy(v)
            changed["git"]["deploymentEnabled"][m["head_branch"]] = new_value
            with self.subTest(value=new_value), self.assertRaisesRegex(ValueError, "Preview"):
                check_no_go(m, changed, p)

    def test_retention_cannot_be_approved_by_manifest_edit(self):
        m, v, p = fixtures()
        altered = copy.deepcopy(p)
        altered["fk_decisions"][0]["decision"] = "APPROVED"
        with self.assertRaises(ValueError):
            check_no_go(m, v, altered)
        altered = copy.deepcopy(p)
        altered["approved_retention_periods"] = True
        with self.assertRaises(ValueError):
            check_no_go(m, v, altered)

    def test_each_pending_gate_is_required(self):
        m, v, p = fixtures()
        for key in EXPECTED_HOLD:
            altered = copy.deepcopy(m)
            del altered[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                check_no_go(altered, v, p)

if __name__ == "__main__":
    unittest.main()
