import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pr01_local_migration_rehearsal import guard, DROP_ORDER
from pr01_cascade_risk_review import assess
from pr00_a2c2_audit_sql import PR01_ADDITIVE_MODELS


class Pr01Phase8Guards(unittest.TestCase):
    def env(self, **changes):
        baseline = {
            "CI": "true", "GITHUB_ACTIONS": "true",
            "PR01_LOCAL_REHEARSAL": "true",
            "DATABASE_URL": "postgresql://postgres:postgres@127.0.0.1:5432/pr01_rehearsal?schema=public",
        }
        return {**baseline, **changes}

    def test_explicit_disposable_ci_gate_is_required(self):
        self.assertIsNone(guard(self.env()))
        for field, value in (
            ("CI", "false"),
            ("GITHUB_ACTIONS", "false"),
            ("PR01_LOCAL_REHEARSAL", "false"),
            ("DATABASE_URL", "postgresql://postgres:postgres@neon.example:5432/pr01_rehearsal"),
            ("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/flipform_ci"),
            ("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/production"),
            ("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pr01_rehearsal"),
        ):
            with self.subTest(field=field, value=value):
                with self.assertRaisesRegex(ValueError, "Requires|Refusing"):
                    guard(self.env(**{field: value}))
        with self.assertRaisesRegex(ValueError, "Refusing"):
            guard(self.env(DIRECT_URL="postgresql://postgres:postgres@neon.example:5432/prod"))

    def test_rollback_inventory_is_explicit_and_only_new_tables(self):
        self.assertEqual(len(DROP_ORDER), 10)
        self.assertEqual(set(DROP_ORDER), set(PR01_ADDITIVE_MODELS.values()))
        self.assertEqual(DROP_ORDER[-1], "api_v1_integrations")
        self.assertEqual(DROP_ORDER[0], "api_v1_delivery_attempts")

    def test_cascade_review_exposes_all_ten_foreign_keys_as_unapproved(self):
        rows = list(PR01_ADDITIVE_MODELS.values())
        sql = "".join(
            f'ALTER TABLE "{name}" ADD CONSTRAINT "{name}_fk" '
            f'FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") '
            'ON DELETE CASCADE ON UPDATE CASCADE;\n'
            for name in rows
        )
        review = assess(sql)
        self.assertEqual(review["fk_count"], 10)
        self.assertFalse(review["production_migration_authorized"])
        self.assertEqual(len(review["fk_cascades"]), 10)
        self.assertTrue(any("credential_audits" in x for x in review["release_blockers"]))
        with self.assertRaisesRegex(ValueError, "action changed"):
            assess(sql.replace("ON DELETE CASCADE", "ON DELETE RESTRICT", 1))
        with self.assertRaisesRegex(ValueError, "Expected exactly 10"):
            assess(sql.split(";", 1)[1])

if __name__ == "__main__":
    unittest.main()
