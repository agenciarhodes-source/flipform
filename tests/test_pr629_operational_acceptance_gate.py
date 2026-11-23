"""Negative regression: accepting operational responsibility is not production authorization."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from pr629_operational_acceptance_gate import verify,RECORD,HOLD,RETENTION

class OwnerOperationalAcceptanceGate(unittest.TestCase):
    def fixture(self,root,record=None):
        for path in (RECORD,HOLD,RETENTION):
            target=root/path
            target.parent.mkdir(parents=True,exist_ok=True)
            value=json.loads((ROOT/path).read_text())
            if path==RECORD and record is not None:value=record
            target.write_text(json.dumps(value))
    def test_declared_acceptance_does_not_release_api(self):
        value=verify()
        self.assertEqual(value["release"],"NO_GO")
        self.assertEqual(value["technical_operational_readiness"],"INCOMPLETE")
    def test_fabricated_signoffs_are_rejected(self):
        original=json.loads((ROOT/RECORD).read_text())
        for field,new in (("production_deployment_authorized",True),
                          ("merge_authorized",True),
                          ("api_activation_authorized",True),
                          ("comprehensive_runtime_egress_attested",True),
                          ("timestamp_lsn_pitr_restoration_verified",True),
                          ("lgpd_retention_and_legal_hold_approved",True),
                          ("numeric_rto_target_minutes",30),
                          ("operational_technical_completion","COMPLETE"),
                          ("release_authorization","GRANTED")):
            with self.subTest(field=field),tempfile.TemporaryDirectory() as tmp:
                fake=copy.deepcopy(original)
                fake[field]=new
                root=Path(tmp)
                self.fixture(root,fake)
                with self.assertRaises(ValueError):verify(root)
    def test_preview_off_required(self):
        original=json.loads((ROOT/RECORD).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            fake=copy.deepcopy(original)
            fake["live_preview_flags_snapshot"]["nonsecret_flags"]["FLIPFORM_API_V1_ENABLED"]="true"
            root=Path(tmp)
            self.fixture(root,fake)
            with self.assertRaises(ValueError):verify(root)
if __name__=="__main__": unittest.main()
