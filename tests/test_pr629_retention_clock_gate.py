"""Negative PR629 retention marker checks; no external services."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from pr629_retention_clock_gate import verify,AUDIT,CANDIDATES,WORKBOOK,SCHEMA,MIGRATION,INTEGRATION,QUOTA,DIAGNOSTIC,CLOCKS

class RetentionClockTests(unittest.TestCase):
    def fixture(self,directory,changed=None):
        changed=changed or {}
        for p in (AUDIT,CANDIDATES,WORKBOOK,SCHEMA,MIGRATION,INTEGRATION,QUOTA,DIAGNOSTIC,CLOCKS):
            target=directory/p
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(changed.get(p,(ROOT/p).read_text()))
    def test_safe_schema_is_not_purge_approval(self):
        result=verify()
        self.assertEqual(result["nullable_fields_staged"],5)
        self.assertFalse(result["cleanup_authorized"])
    def test_forged_go_rejected(self):
        source=json.loads((ROOT/AUDIT).read_text())
        for key,value in (("automated_purge_authorized",True),
                          ("production_release_authorized",True),
                          ("legal_review_completed",True),("status","READY")):
            with self.subTest(key=key),tempfile.TemporaryDirectory() as tmp:
                c=copy.deepcopy(source);c[key]=value
                root=Path(tmp);self.fixture(root,{AUDIT:json.dumps(c)})
                with self.assertRaises(ValueError):verify(root)
    def test_missing_schema_field_rejected(self):
        s=(ROOT/SCHEMA).read_text()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.fixture(root,{SCHEMA:s.replace('  disabledAt  DateTime? @map("disabled_at")\n','')})
            with self.assertRaises(ValueError):verify(root)
    def test_destructive_sql_rejected(self):
        m=(ROOT/MIGRATION).read_text()
        for snippet in ('DELETE FROM "api_v1_credentials";',
                        'DROP TABLE "api_v1_inbox_events";',
                        'ALTER TABLE "api_v1_quota_buckets" ADD COLUMN bad INT NOT NULL;'):
            with self.subTest(snippet=snippet),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);self.fixture(root,{MIGRATION:m+"\n"+snippet})
                with self.assertRaises(ValueError):verify(root)
    def test_missing_clock_writer_rejected(self):
        s=(ROOT/QUOTA).read_text()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.fixture(root,{QUOTA:s.replace("windowEnd, consumed: 1","consumed: 1")})
            with self.assertRaises(ValueError):verify(root)
    def test_missing_category_rejected(self):
        c=json.loads((ROOT/AUDIT).read_text());c["items"].pop()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.fixture(root,{AUDIT:json.dumps(c)})
            with self.assertRaises(ValueError):verify(root)
if __name__=="__main__":unittest.main()
