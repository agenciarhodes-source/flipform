"""Read-only preflight regression and negative tests; no external I/O or credentials."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from api_v1_homologation_preflight import verify, EVIDENCE, VERCEL, PR01_HOLD, RETENTION

class HomologationPreflightTest(unittest.TestCase):
    def test_snapshot_is_a_hold_not_release(self):
        result = verify()
        self.assertTrue(result["preflight_checks_passed"])
        self.assertEqual(result["decision"], "NO_GO")
        self.assertEqual(result["routes_scoped_checked"], 7)
        self.assertFalse(result["production_release_authorized"])
        self.assertFalse(result["staging_schema_ready"])
        self.assertEqual(result["pending_fk_retention_decisions"], 10)

    def make_tree(self, folder, evidence=None, vercel=None, hold=None, retention=None):
        for file in (EVIDENCE, VERCEL, PR01_HOLD, RETENTION):
            target = folder / file.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            original = json.loads(file.read_text(encoding="utf-8"))
            replacement = {EVIDENCE:evidence, VERCEL:vercel, PR01_HOLD:hold, RETENTION:retention}[file]
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

if __name__=="__main__":
    unittest.main()
