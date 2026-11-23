"""Narrow PR629 staging-only transport guard: intentionally NOT a network firewall."""
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
MODULE=ROOT/"lib/qa/pr629-external-egress.ts"
TRANSPORTS={
"lib/tracking/meta-capi.ts": ("meta-capi",),
"lib/tracking/google-data-manager.ts": ("google-oauth","google-conversions"),
"lib/meta/instagram-outbound.ts": ("instagram-send",),
"lib/meta/whatsapp-outbound.ts": ("whatsapp-send",),
"lib/stripe/client.ts": ("stripe-sdk",),
"lib/email/send.ts": ("resend-email","smtp-email"),
}

class Pr629QaEgressSafety(unittest.TestCase):
    def test_gate_requires_explicit_preview_opt_in(self):
        text=MODULE.read_text()
        self.assertIn("env.PR629_BLOCK_EXTERNAL_EGRESS === 'true'",text)
        self.assertIn("env.VERCEL_ENV === 'preview'",text)
        self.assertIn("PR629_EXTERNAL_EGRESS_BLOCKED",text)
        self.assertNotIn("console.log(",text)
        self.assertNotIn("console.error(",text)

    def test_known_external_transports_are_gated(self):
        for relative, providers in TRANSPORTS.items():
            with self.subTest(module=relative):
                src=(ROOT/relative).read_text()
                self.assertIn("import { assertPr629NoExternalEgress }",src)
                for name in providers:
                    self.assertEqual(src.count("assertPr629NoExternalEgress('"+name+"')"),1)

    def test_gate_precedes_provider_network_execution(self):
        checks=[
          ("lib/tracking/meta-capi.ts","meta-capi","fetch("),
          ("lib/tracking/google-data-manager.ts","google-conversions","response = await (options.fetchImpl || fetch)(GOOGLE_DATA_MANAGER_INGEST_URL"),
          ("lib/meta/instagram-outbound.ts","instagram-send","response = await fetch("),
          ("lib/meta/whatsapp-outbound.ts","whatsapp-send","response = await fetch("),
          ("lib/stripe/client.ts","stripe-sdk","new Stripe("),
          ("lib/email/send.ts","resend-email","fetch('https://api.resend.com/emails'"),
          ("lib/email/send.ts","smtp-email","nodemailer.createTransport("),
        ]
        for relative,provider,network in checks:
            with self.subTest(relative=relative, provider=provider):
                s=(ROOT/relative).read_text()
                guard=s.index("assertPr629NoExternalEgress('"+provider+"')")
                call=s.index(network)
                self.assertLess(guard,call)

if __name__=="__main__":
    unittest.main()
