"""Independent static guard for PR-C; no database or external provider access."""
import re
import unittest
from pathlib import Path
from tests.flip_voice_legacy_audit_fixture import historical_pr01_candidate

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
SQL = (ROOT / "prisma/migrations/20261126001000_universal_sync_fixture/migration.sql").read_text(encoding="utf-8")


class UniversalSyncStaticTests(unittest.TestCase):
    def test_historical_projection_remains_exact(self):
        projected = historical_pr01_candidate(SCHEMA)
        self.assertEqual(len(re.findall(r"(?m)^model\s+\w+\s*\{", projected)), 102)
        self.assertNotIn("model UniversalSyncRun ", projected)
        self.assertNotIn("model UniversalDataRecord ", projected)

    def test_rejects_unknown_or_altered_new_models(self):
        for changed in (
            SCHEMA.replace('@@map("universal_sync_runs")', '@@map("unexpected")'),
            SCHEMA.replace('syncRuns     UniversalSyncRun[]', 'syncRuns     UniversalDataRecord[]'),
            SCHEMA.replace('references: [tenantId, connectionId, id], onDelete: Restrict, map: "uc_data_run_fk"', 'references: [tenantId, connectionId, id], onDelete: Cascade, map: "uc_data_run_fk"'),
            SCHEMA + '\nmodel Unexpected {\n id String @id\n}\n',
        ):
            with self.subTest(changed=changed[-100:]):
                self.assertNotEqual(changed, SCHEMA)
                with self.assertRaises(ValueError):
                    historical_pr01_candidate(changed)

    def test_migration_additive_and_tenant_scoped(self):
        self.assertEqual(set(re.findall(r'CREATE TABLE "([^"]+)"', SQL)), {"universal_sync_runs", "universal_data_records"})
        self.assertEqual(set(re.findall(r'ALTER TABLE "([^"]+)"', SQL)), {"universal_sync_runs", "universal_data_records"})
        self.assertNotRegex(SQL, r"(?i)\b(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\")\b")
        self.assertIn('FOREIGN KEY ("tenant_id","connection_id") REFERENCES "universal_connections"("tenant_id","id") ON DELETE RESTRICT', SQL)
        self.assertIn('FOREIGN KEY ("tenant_id","connection_id","run_id") REFERENCES "universal_sync_runs"("tenant_id","connection_id","id") ON DELETE RESTRICT', SQL)
        self.assertIn('("tenant_id","connection_id","kind","source_id")', SQL)
        self.assertIn('("tenant_id","connection_id","request_key")', SQL)


if __name__ == "__main__":
    unittest.main()
