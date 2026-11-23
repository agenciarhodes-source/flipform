"""Security properties of PR629 dormant preview database attestation."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class DbTargetAttestationSecurity(unittest.TestCase):
    def test_fail_closed_route_checks_before_query(self):
        route = (ROOT / "app/api/pr629-qa/db-target/route.ts").read_text()
        preview = route.index("!isPr629DbAttestationAllowed(process.env)")
        token = route.index("!authorized(req)")
        target = route.index("!pr629DbTargetsMatchApprovedQa(process.env)")
        database_query = route.index("prisma.$queryRaw")
        self.assertLess(preview, target)
        self.assertLess(token, target)
        self.assertLess(target, database_query)
        self.assertIn("timingSafeEqual", route)
        self.assertIn("configured.length < 32", route)
        self.assertIn("'Cache-Control': 'no-store, max-age=0'", route)
        self.assertNotIn("console.log(", route)
        self.assertNotIn("console.error(", route)
        self.assertNotIn("process.env.DATABASE_URL,", route)

    def test_only_approved_qa_hostname_and_preview_allowed(self):
        helper = (ROOT / "lib/qa/pr629-db-target-attestation.ts").read_text()
        self.assertIn("ep-round-cake-bct4seb5.c-16.us-east-1.aws.neon.tech", helper)
        self.assertIn("env.VERCEL_ENV === 'preview'", helper)
        self.assertIn("env.VERCEL_GIT_COMMIT_REF === 'security/api-v1-homologation-20261121'", helper)
        self.assertIn("env.FLIPFORM_API_V1_ENABLED === 'false'", helper)
        self.assertIn("env.PR629_DB_ATTESTATION_ENABLED === 'true'", helper)
        self.assertIn("env.PR629_DB_ATTESTATION_EXPIRES_AT", helper)
        self.assertIn("expiryMs - nowMs <= 30 * 60 * 1000", helper)
        self.assertIn("env.PR629_BLOCK_EXTERNAL_EGRESS === 'true'", helper)

if __name__ == "__main__":
    unittest.main()
