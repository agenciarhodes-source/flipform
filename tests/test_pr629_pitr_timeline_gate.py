"""Off-line negative cases: historical schemas are not a completed PITR restore."""
import copy,json,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from pr629_pitr_timeline_gate import verify,EVIDENCE,OPERATION,GATES
class HistoricalTimeTravelTests(unittest.TestCase):
    def fixture(self,folder,p=None):
        for f in (EVIDENCE,OPERATION,GATES):
            dest=folder/f
            dest.parent.mkdir(parents=True,exist_ok=True)
            data=json.loads((ROOT/f).read_text())
            if f==EVIDENCE and p is not None:data=p
            dest.write_text(json.dumps(data))
    def test_history_is_real_but_not_restore(self):
        r=verify()
        self.assertFalse(r["native_pitr_completed"])
        self.assertEqual(r["release"],"NO_GO")
    def test_fabricated_restore_or_release_is_rejected(self):
        original=json.loads((ROOT/EVIDENCE).read_text())
        for key,val in (
           ("native_timestamp_pitr_restore_executed",True),
           ("point_in_time_restore_data_integrity_verified",True),
           ("numeric_rto_measured",True),
           ("production_project_touched",True),
           ("delete_branch_executed",True),
           ("release_gate","GO"),
           ("isolated_root_creation_result","SUCCESS"),
        ):
            with self.subTest(field=key),tempfile.TemporaryDirectory() as tmp:
                fake=copy.deepcopy(original);fake[key]=val
                root=Path(tmp);self.fixture(root,p=fake)
                with self.assertRaises(ValueError):verify(root)
if __name__=="__main__": unittest.main()
