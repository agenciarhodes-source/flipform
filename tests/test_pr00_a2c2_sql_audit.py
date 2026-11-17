import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pr00_a2c2_audit_sql import audit_sql, split_statements

SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")

TEST_SQL = """
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner');
-- CreateTable
CREATE TABLE "users" ("id" TEXT NOT NULL);
CREATE INDEX "users_id_idx" ON "users"("id");
ALTER TABLE "users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
"""

class OfflineAuditTests(unittest.TestCase):
    def test_sql_comments_quotes_and_fk_cascade(self):
        parsed = split_statements(TEST_SQL)
        self.assertEqual(len(parsed), 4)
        self.assertIn("ON DELETE CASCADE", parsed[-1])

    def test_rejects_destructive_commands_and_shows_reason(self):
        for sql in [
            'DROP TABLE "users";',
            'TRUNCATE "users";',
            'DELETE FROM "users";',
            'ALTER TABLE "users" DROP COLUMN "id";',
            'UPDATE "users" SET "id" = \'x\';',
            'CREATE FUNCTION f() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;',
        ]:
            with self.subTest(sql=sql):
                with self.assertRaisesRegex(ValueError, "destructive or unauthorized"):
                    audit_sql(sql, SCHEMA)

    def test_accepts_only_synthetic_additive_baseline_with_92_mapped_tables(self):
        blocks = re.findall(r"(?ms)^model\s+\w+\s*\{(.*?)^\}", SCHEMA)
        names = [re.search(r'@@map\("([^"]+)"\)', block).group(1) for block in blocks]
        enums = re.findall(r"(?m)^enum\s+(\w+)\s*\{", SCHEMA)
        sql = "".join(f'CREATE TYPE "{enum}" AS ENUM (\'fixture\');\n' for enum in enums)
        sql += "".join(f'CREATE TABLE "{table}" ("id" TEXT NOT NULL);\n' for table in names)
        sql += f'CREATE INDEX "fixture_idx" ON "{names[0]}" ("id");\n'
        sql += f'ALTER TABLE "{names[0]}" ADD CONSTRAINT "fixture_fk" FOREIGN KEY ("id") REFERENCES "{names[0]}" ("id") ON DELETE CASCADE;\n'
        result = audit_sql(sql, SCHEMA)
        self.assertEqual(result["tables"], 92)
        self.assertEqual(result["enums"], 10)
        self.assertTrue(result["pass_additive_sql_review"])
        self.assertTrue(result["NOT_AUTHORIZED_FOR_EXECUTION"])

    def test_guard_preserved_for_both_audit_branches(self):
        config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        rules = config["git"]["deploymentEnabled"]
        self.assertIs(rules["audit/pr00-a2s-isolation"], False)
        self.assertIs(rules["audit/pr00-a2c2-prisma-sql-offline-20261117"], False)
        self.assertNotIn("crons", config)

    def test_workflow_is_offline_only(self):
        wf = (ROOT / ".github/workflows/pr00-a2c2-sql-offline.yml").read_text(encoding="utf-8")
        for forbidden in (
            "secrets.DATABASE_URL", "secrets.DIRECT_URL",
            "prisma db push", "prisma db execute",
            "prisma migrate deploy", "pg_restore", "psql -",
        ):
            self.assertNotIn(forbidden, wf)
        self.assertIn("127.0.0.1:1/never_connect", wf)
        self.assertIn("--from-empty", wf)
        self.assertIn("--to-schema-datamodel", wf)
        self.assertIn("persist-credentials: false", wf)
