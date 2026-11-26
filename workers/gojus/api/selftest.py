"""Fixed synthetic runtime check; never accepts documents, URLs or arbitrary commands.

Enable only in isolated, Vercel-Authentication-protected staging deployments.
No network, secrets, user data or durable output.
"""
from http.server import BaseHTTPRequestHandler
from hashlib import sha256
from io import BytesIO
import json
import os
from threading import Lock

from PIL import Image
from pypdf import PdfReader, PdfWriter
from pdf_bundle import Source, build_bundle

LOCK = Lock()

def run_selftest():
    image = BytesIO()
    Image.new("RGB", (120, 160), "white").save(image, "PNG")
    original = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=144, height=216)
    writer.write(original)
    inputs = [(image.getvalue(), "image/png"), (original.getvalue(), "application/pdf")]
    result = build_bundle([Source(data, mime, sha256(data).hexdigest()) for data, mime in inputs])
    parsed = PdfReader(BytesIO(result.pdf), strict=True)
    if result.page_count != 2 or len(parsed.pages) != 2 or not result.pdf.startswith(b"%PDF-") or result.output_sha256 != sha256(result.pdf).hexdigest():
        raise ValueError("Self-test failed")
    return {"ok": True, "synthetic": True, "pages": 2, "bytes": len(result.pdf)}

def enabled(env):
    # Never enable alongside actual R2 processing. The staging project must
    # keep Vercel Authentication on; this flag is not an authentication method.
    return env.get("FLIP_PDF_SELFTEST_ENABLED") == "1" and env.get("GOJUS_PDF_R2_LIFECYCLE_VERIFIED") != "1"

class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, data):
        body = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not enabled(os.environ) or self.path != "/api/selftest" or self.headers.get("Content-Length", "0") != "0" or self.headers.get("Transfer-Encoding"):
            return self.reply(403, {"error": "unavailable"})
        if not LOCK.acquire(blocking=False):
            return self.reply(503, {"error": "busy"})
        try:
            return self.reply(200, run_selftest())
        except Exception:
            return self.reply(503, {"error": "selftest_failed"})
        finally:
            LOCK.release()
