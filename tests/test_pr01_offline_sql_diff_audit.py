import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pr01_offline_sql_diff_audit import audit, check_schema_delta, check_sql
from tests.flip_voice_legacy_audit_fixture import historical_pr01_candidate
from pr00_a2c2_audit_sql import PR01_ADDITIVE_MODELS

CANDIDATE = historical_pr01_candidate((ROOT / "prisma/schema.prisma").read_text(encoding="utf-8"))

def synthetic_baseline():
    pattern = r"(?ms)^model\s+(?:" + "|".join(PR01_ADDITIVE_MODELS) + r")\s*\{.*?^\}\n?"
    original = re.sub(pattern, "", CANDIDATE)
    for field in ("apiV1Integrations", "apiV1EntitlementGrants", "apiV1CredentialAudits"):
        original = re.sub(r"(?m)^\s*" + field + r"\s+\w+\[\]\s*\n", "", original)
    return original

def valid_sql():
    tables = sorted(PR01_ADDITIVE_MODELS.values())
    sql = "".join(f'CREATE TABLE "{t}" ("id" TEXT NOT NULL);\n' for t in tables)
    sql += f'CREATE UNIQUE INDEX "fixture_idx" ON "{tables[0]}" ("id");\n'
    sql += (f'ALTER TABLE "{tables[0]}" ADD CONSTRAINT "fixture_fk" '
            f'FOREIGN KEY ("id") REFERENCES "tenants"("id") ON DELETE CASCADE;\n')
    return sql

class Pr01OfflineSqlAuditTests(unittest.TestCase):
    def test_baseline_candidate_and_sql_allowlist(self):
        baseline = synthetic_baseline()
        self.assertEqual(len(re.findall(r"(?m)^model\s+", baseline)), 92)
        self.assertEqual(len(re.findall(r"(?m)^model\s+", CANDIDATE)), 102)
        expected = check_schema_delta(baseline, CANDIDATE)
        self.assertEqual(expected, set(PR01_ADDITIVE_MODELS.values()))
        report = audit(baseline, CANDIDATE, valid_sql())
        self.assertEqual(report["tables_added"], 10)
        self.assertTrue(report["NOT_AUTHORIZED_FOR_EXECUTION"])

    def test_rejects_change_to_existing_model(self):
        baseline = synthetic_baseline().replace(
            '@@map("tenants")', '@@map("different_tenants")')
        with self.assertRaisesRegex(ValueError, "Existing Prisma model changed"):
            check_schema_delta(baseline, CANDIDATE)

    def test_rejects_unauthorized_additions(self):
        with self.assertRaisesRegex(ValueError, "Expected 92 baseline and 102"):
            check_schema_delta(synthetic_baseline(),
                CANDIDATE + '\nmodel Unexpected {\n id String @id\n @@map("surprise")\n}\n')

    def test_never_accepts_existing_table_updates_or_destructive_commands(self):
        allowed = set(PR01_ADDITIVE_MODELS.values())
        first = sorted(allowed)[0]
        for sql, label in [
            ('DROP TABLE "tenants";', 'outside additive'),
            ('ALTER TABLE "tenants" ADD COLUMN "enabled" BOOLEAN;', 'outside additive'),
            (f'CREATE INDEX "baseline_idx" ON "tenants" ("id");', 'baseline table'),
            (f'ALTER TABLE "tenants" ADD CONSTRAINT "x" FOREIGN KEY ("id") REFERENCES "{first}"("id");', 'baseline table'),
            ('CREATE TYPE "Unexpected" AS ENUM (\'x\');', 'outside additive'),
            ('DELETE FROM "tenants";', 'outside additive'),
            (f'CREATE TABLE "tenants" ("id" TEXT);', 'outside PR01'),
        ]:
            with self.subTest(sql=sql):
                with self.assertRaisesRegex(ValueError, label):
                    check_sql(valid_sql() + sql, allowed)

    def test_missing_table_and_duplicate_are_denied(self):
        allowed = set(PR01_ADDITIVE_MODELS.values())
        one = sorted(allowed)[0]
        self.assertRaisesRegex(ValueError, "exactly ten", check_sql,
            valid_sql().replace(f'CREATE TABLE "{one}" ("id" TEXT NOT NULL);\n', ''), allowed)
        self.assertRaisesRegex(ValueError, "exactly ten", check_sql,
            valid_sql() + f'CREATE TABLE "{one}" ("id" TEXT);\n', allowed)

if __name__ == "__main__":
    unittest.main()
