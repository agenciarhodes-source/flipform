"""Private worker HTTP adapter. Bind to loopback behind an approved TLS reverse proxy.

No AI, no remote fetching, no disk persistence, no customer data in request logs.
Deploy only inside a resource-limited isolated service; no public direct listener.
"""
import base64
import binascii
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pdf_bundle import Source, BundleError, build_bundle

MAX_BODY = 29 * 1024 * 1024
MAX_INPUT = 20 * 1024 * 1024
MAX_DOWNLOAD = 4 * 1024 * 1024

def convert(payload):
    if not isinstance(payload, dict) or set(payload) != {"files"}:
        raise BundleError("Invalid manifest")
    files = payload["files"]
    if not isinstance(files, list) or not 1 <= len(files) <= 40:
        raise BundleError("Invalid manifest")
    sources = []
    size = 0
    for f in files:
        if not isinstance(f, dict) or set(f) != {"mime", "sha256", "content"}:
            raise BundleError("Invalid file")
        if not all(isinstance(f[k], str) for k in f):
            raise BundleError("Invalid file")
        if len(f["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in f["sha256"]):
            raise BundleError("Invalid hash")
        data = base64.b64decode(f["content"], validate=True)
        size += len(data)
        if size > MAX_INPUT:
            raise OverflowError("Input limit")
        sources.append(Source(data, f["mime"], f["sha256"]))
    result = build_bundle(sources)
    if len(result.pdf) > MAX_DOWNLOAD:
        raise OverflowError("Output limit")
    return result

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def log_message(self, *_args):
        pass

    def respond(self, status, content=b"", mime="text/plain", sha=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        if sha:
            self.send_header("X-PDF-SHA256", sha)
        self.end_headers()
        if content:
            self.wfile.write(content)

    def do_POST(self):
        token = os.environ.get("GOJUS_PDF_WORKER_TOKEN", "")
        if len(token) < 32 or not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + token).encode()):
            self.respond(403)
            return
        if self.path != "/v1/pdf" or self.headers.get("Content-Type") != "application/json" or self.headers.get("Transfer-Encoding"):
            self.respond(400)
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= MAX_BODY:
                self.respond(413)
                return
            raw = self.rfile.read(n)
            if len(raw) != n:
                self.respond(400)
                return
            result = convert(json.loads(raw))
        except OverflowError:
            self.respond(413)
            return
        except (BundleError, ValueError, TypeError, binascii.Error, OSError):
            self.respond(422)
            return
        except Exception:
            self.respond(500)
            return
        self.respond(200, result.pdf, "application/pdf", result.output_sha256)

def main():
    if len(os.environ.get("GOJUS_PDF_WORKER_TOKEN", "")) < 32:
        raise SystemExit("Worker token not configured")
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()

if __name__ == "__main__":
    main()
