"""Read-only preflight regression and negative tests; no external I/O or credentials."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from api_v1_homologation_preflight import verify, EVIDENCE, VERCEL, PR01_HOLD, RETENTION, PROPOSAL, CANDIDATES

class HomologationPreflightTest(unittest.TestCase):
    def test_snapshot_is_a_hold_not_release(self):
        result = verify()
        self.assertTrue(result["preflight_checks_passed"])
        self.assertEqual(result["decision"], "NO_GO")
        self.assertEqual(result["routes_scoped_checked"], 7)
        self.assertFalse(result["production_release_authorized"])
        self.assertFalse(result["staging_schema_ready"])
        self.assertEqual(result["pending_fk_retention_decisions"], 10)

    def make_tree(self, folder, evidence=None, vercel=None, hold=None, retention=None, proposal=None, candidates=None):
        for file in (EVIDENCE, VERCEL, PR01_HOLD, RETENTION, PROPOSAL, CANDIDATES):
            target = folder / file.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            original = json.loads(file.read_text(encoding="utf-8"))
            replacement = {EVIDENCE:evidence, VERCEL:vercel, PR01_HOLD:hold, RETENTION:retention, PROPOSAL:proposal, CANDIDATES:candidates}[file]
            target.write_text(json.dumps(original if replacement is None else replacement))
        for path in (
            "app/api/v1/capabilities/route.ts",
            "app/api/v1/pipelines/route.ts",
            "app/api/v1/pipelines/[pipelineId]/metrics/route.ts",
            "app/api/v1/forms/route.ts",
            "app/api/v1/forms/[formId]/fields/route.ts",
            "app/api/v1/leads/route.ts",
            "app/api/v1/leads/[leadId]/route.ts",
        ):
            target=folder/path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text((ROOT/path).read_text(encoding="utf-8"))

    def test_fake_api_release_claim_fails(self):
        snapshot=json.loads(EVIDENCE.read_text())
        for key, value in (("production_deployment_authorized",True),
                           ("staging_deployment_authorized",True),
                           ("enable_api_authorized",True)):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as tmp:
                altered=copy.deepcopy(snapshot)
                altered[key]=value
                target=Path(tmp)
                self.make_tree(target,evidence=altered)
                with self.assertRaises(ValueError): verify(target)

    def test_pretend_staging_is_ready_fails(self):
        snapshot=json.loads(EVIDENCE.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(snapshot)
            fake["gates"]["baseline_staging_schema"]="PASS"
            root=Path(tmp)
            self.make_tree(root,evidence=fake)
            with self.assertRaises(ValueError): verify(root)

    def test_enabling_preview_fails(self):
        original=json.loads(VERCEL.read_text())
        original["git"]["deploymentEnabled"]["security/api-v1-homologation-20261121"]=True
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.make_tree(root,vercel=original)
            with self.assertRaises(ValueError): verify(root)

    def test_unauthorized_retention_approval_fails(self):
        original=json.loads(RETENTION.read_text())
        original["fk_decisions"][0]["decision"]="APPROVED"
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.make_tree(root,retention=original)
            with self.assertRaises(ValueError): verify(root)

    def test_qa_lab_cannot_claim_runtime_homologation(self):
        snapshot=json.loads(EVIDENCE.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(snapshot)
            fake["sources"]["neon_staging"]["full_schema_qa_lab"]["end_to_end_deployed_app_tested"]=True
            root=Path(tmp)
            self.make_tree(root,evidence=fake)
            with self.assertRaises(ValueError): verify(root)

    def test_qa_lab_counts_must_match_structure(self):
        snapshot=json.loads(EVIDENCE.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(snapshot)
            fake["sources"]["neon_staging"]["full_schema_qa_lab"]["api_foreign_keys_on_delete_restrict"]=9
            root=Path(tmp)
            self.make_tree(root,evidence=fake)
            with self.assertRaises(ValueError): verify(root)

    def test_retention_workbook_covers_all_pending_decisions(self):
        result = verify()
        self.assertEqual(result["pending_fk_retention_decisions"], 10)

    def test_cannot_fake_privacy_approval_in_workbook(self):
        original=json.loads(PROPOSAL.read_text())
        for key, value in (
            ("retention_and_lgpd_approved", True),
            ("review_status", "APPROVED"),
            ("approved_by", "unverified actor"),
        ):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as tmp:
                fake=copy.deepcopy(original)
                fake[key]=value
                root=Path(tmp)
                self.make_tree(root, proposal=fake)
                with self.assertRaises(ValueError): verify(root)

    def test_retention_workbook_rejects_missing_row_and_fabricated_period(self):
        original=json.loads(PROPOSAL.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(original)
            fake["items"].pop()
            root=Path(tmp)
            self.make_tree(root, proposal=fake)
            with self.assertRaises(ValueError): verify(root)
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(original)
            fake["items"][0]["retention_period"]=365
            root=Path(tmp)
            self.make_tree(root, proposal=fake)
            with self.assertRaises(ValueError): verify(root)

    def test_owner_designation_does_not_approve_policy_or_replace_juridical_review(self):
        original=json.loads(PROPOSAL.read_text())
        for field,value in (
            ("legal_review_status", "APPROVED"),
            ("policy_approval_status", "APPROVED"),
            ("final_release_authorized", True),
            ("personal_data_officer_appointed_by_this_record", True),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                fake=copy.deepcopy(original)
                fake["governance_responsibility"][field]=value
                root=Path(tmp)
                self.make_tree(root,proposal=fake)
                with self.assertRaises(ValueError): verify(root)

    def test_candidate_retention_is_not_policy(self):
        record = json.loads(CANDIDATES.read_text())
        self.assertEqual(record["state"], "DISCUSSION_DRAFT")
        self.assertEqual(len(record["items"]), 10)
        self.assertFalse(record["may_enable_cleanup"])
        self.assertFalse(record["may_enable_production"])

    def test_fake_candidate_release_must_fail(self):
        original = json.loads(CANDIDATES.read_text())
        for field,value in (("state", "APPROVED"),
                            ("legal_review_completed", True),
                            ("owner_final_approval", True),
                            ("may_enable_cleanup", True)):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                fake = copy.deepcopy(original)
                fake[field] = value
                root = Path(tmp)
                self.make_tree(root,candidates=fake)
                with self.assertRaises(ValueError): verify(root)

    def test_candidate_missing_row_or_unbounded_retention_fails(self):
        original=json.loads(CANDIDATES.read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(original)
            fake["items"].pop()
            root=Path(tmp)
            self.make_tree(root,candidates=fake)
            with self.assertRaises(ValueError): verify(root)
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(original)
            fake["items"][0]["candidate_retention_days"]=0
            root=Path(tmp)
            self.make_tree(root,candidates=fake)
            with self.assertRaises(ValueError): verify(root)


if __name__=="__main__":
    unittest.main()
