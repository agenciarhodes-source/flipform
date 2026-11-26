import re
import unittest
from pathlib import Path
from tests.flip_voice_legacy_audit_fixture import historical_pr01_candidate

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
SQL = (ROOT / "prisma/migrations/20261126040000_flip_ads_campaign_drafts/migration.sql").read_text(encoding="utf-8")

class FlipAdsDraftStaticTests(unittest.TestCase):
    def test_projection_remains_historical(self):
        self.assertEqual(len(re.findall(r"(?m)^model\s+\w+\s*\{", historical_pr01_candidate(SCHEMA))), 102)
        for old, new in [
            ('@@map("flip_ads_campaign_drafts")', '@@map("unknown_ads")'),
            ('flipAdsDrafts FlipAdsCampaignDraft[]', 'flipAdsDrafts FlipAdsDraftAudit[]'),
            ('onDelete: Restrict, map: "fad_audit_draft_fk"', 'onDelete: Cascade, map: "fad_audit_draft_fk"'),
        ]:
            self.assertIn(old, SCHEMA)
            with self.assertRaises(ValueError):
                historical_pr01_candidate(SCHEMA.replace(old,new))
    def test_additive_and_scoped(self):
        self.assertEqual(set(re.findall(r'CREATE TABLE "([^"]+)"', SQL)), {"flip_ads_campaign_drafts", "flip_ads_draft_audits"})
        self.assertEqual(set(re.findall(r'ALTER TABLE "([^"]+)"', SQL)), {"flip_ads_campaign_drafts", "flip_ads_draft_audits"})
        self.assertIn('FOREIGN KEY ("tenant_id","draft_id") REFERENCES "flip_ads_campaign_drafts"("tenant_id","id") ON DELETE RESTRICT', SQL)
        self.assertIn('FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT', SQL)
        self.assertNotRegex(SQL,r'(?i)\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b')
