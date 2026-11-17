"""PR00 A2-C.9: verify lab-only proposal stays guarded and cannot trigger a preview deployment."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_lab_sql_is_fail_closed_and_not_a_migration():
    script=(ROOT / "docs/security/pr00-a2c9-lab-only-constraints.sql").read_text(encoding="utf-8")
    assert "NOT A MIGRATION" in script
    assert "br-quiet-voice-bcs6win0" in script
    assert "holy-fog-36254823" in script
    assert "STOP: wrong branch/database" in script
    assert script.count("ADD CONSTRAINT a2c9_")==6
    assert script.count("VALIDATE CONSTRAINT a2c9_")==3
    assert "DELETE FROM" not in script and "DROP TABLE" not in script and "TRUNCATE " not in script
    assert "ON DELETE CASCADE" in script and "ON DELETE RESTRICT" in script

def test_preview_is_disabled_for_draft_branch():
    config=json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    rules=config["git"]["deploymentEnabled"]
    assert rules["security/pr00-a2c9-multitenant-integrity-lab-20261117"] is False
    assert rules["security/pr00-a2c5-tenant-task-stage-20261117"] is False
    assert rules["audit/pr00-a2c2-prisma-sql-offline-20261117"] is False
    assert rules["audit/pr00-a2s-isolation"] is False
