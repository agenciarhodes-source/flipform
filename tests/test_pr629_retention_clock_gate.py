"""Negative tests for missing lifecycle timestamps; no external I/O."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from pr629_retention_clock_gate import verify, AUDIT,CANDIDATES,WORKBOOK,SCHEMA

class ClockReadinessTests(unittest.TestCase):
    def sample(self,root,audit=None,schema=None):
        for path in (AUDIT,CANDIDATES,WORKBOOK,SCHEMA):
            to=root/path
            to.parent.mkdir(parents=True,exist_ok=True)
            source=(ROOT/path).read_text()
            if path==AUDIT and audit is not None: source=json.dumps(audit)
            if path==SCHEMA and schema is not None: source=schema
            to.write_text(source)
    def test_checked_schema_remains_blocked(self):
        evidence=verify()
        self.assertEqual(evidence["tables_checked"],10)
        self.assertEqual(evidence["clock_blockers"],5)
        self.assertFalse(evidence["automated_purge_authorized"])
    def test_false_readiness_is_rejected(self):
        source=json.loads((ROOT/AUDIT).read_text())
        for field,new in (("automated_purge_authorized",True),
                          ("production_release_authorized",True),
                          ("legal_review_completed",True),
                          ("status","READY")):
            with self.subTest(field=field),tempfile.TemporaryDirectory() as tmp:
                x=copy.deepcopy(source);x[field]=new
                root=Path(tmp);self.sample(root,audit=x)
                with self.assertRaises(ValueError):verify(root)
    def test_clock_invented_without_schema_fails(self):
        source=json.loads((ROOT/AUDIT).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            x=copy.deepcopy(source)
            row=next(i for i in x["items"] if i["table"]=="api_v1_integrations")
            row["technical_clock_state"]="CLOCK_RECORDED_POLICY_PENDING"
            row["missing_recommended_prisma_fields"]=[]
            root=Path(tmp);self.sample(root,audit=x)
            with self.assertRaises(ValueError):verify(root)
    def test_missing_table_is_rejected(self):
        source=json.loads((ROOT/AUDIT).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            x=copy.deepcopy(source);x["items"].pop()
            root=Path(tmp);self.sample(root,audit=x)
            with self.assertRaises(ValueError):verify(root)
    def test_misrepresented_existing_field_fails(self):
        source=(ROOT/SCHEMA).read_text()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.sample(root,schema=source.replace(
                'revokedAt     DateTime? @map("revoked_at")',
                'someRenamedField DateTime? @map("revoked_at")'))
            with self.assertRaises(ValueError):verify(root)

if __name__=="__main__":unittest.main()
