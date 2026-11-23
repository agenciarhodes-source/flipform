"""Verify extra PR629 preview-only outbound transport guards with no external I/O."""
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
GUARD=ROOT/"lib/qa/pr629-external-egress.ts"
SURFACES={
 "lib/meta/instagram-private-reply.ts":[("instagram-private-reply","async function sendPrivateReplyToMeta")],
 "lib/meta/whatsapp-templates.ts":[("whatsapp-templates","async function metaJson")],
 "lib/meta/whatsapp-media.ts":[
  ("whatsapp-media-download","export async function downloadWhatsAppMedia"),
  ("whatsapp-media-upload","export async function uploadWhatsAppMedia")
 ],
 "lib/meta/whatsapp-typing.ts":[("whatsapp-typing","export async function showWhatsAppTyping")],
}
class Pr629AdditionalTransportSafety(unittest.TestCase):
    def test_actual_preview_only_guard_stays_opt_in(self):
        src=GUARD.read_text()
        self.assertIn("env.PR629_BLOCK_EXTERNAL_EGRESS === 'true'",src)
        self.assertIn("env.VERCEL_ENV === 'preview'",src)
    def test_each_transport_checks_guard_before_any_fetch(self):
        for path,functions in SURFACES.items():
            with self.subTest(module=path):
                src=(ROOT/path).read_text()
                self.assertIn("import { assertPr629NoExternalEgress }",src)
                for label,signature in functions:
                    start=src.index(signature)
                    guard="assertPr629NoExternalEgress('"+label+"')"
                    self.assertEqual(src.count(guard),1)
                    guard_at=src.index(guard,start)
                    next_function=src.find("\nexport async function ",start+1)
                    if next_function==-1:next_function=len(src)
                    self.assertLess(guard_at,next_function)
                    fetch_at=src.index("fetch(",start)
                    self.assertLess(guard_at,fetch_at)
    def test_no_data_leaking_logging(self):
        for path in SURFACES:
            src=(ROOT/path).read_text()
            self.assertNotIn("console.log('PR629",src)
if __name__=="__main__": unittest.main()
