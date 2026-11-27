"""Vercel Python Function: only signed R2 object capabilities, no database or R2 keys.

Deploy as separate project rooted at workers/gojus. No request contents in logs.
"""
from http.server import BaseHTTPRequestHandler
from hashlib import sha256
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler
from threading import Lock
import hmac
import json
import os
import re
import time

from pdf_bundle import Source, BundleError, build_bundle

MAX_MANIFEST = 128 * 1024
MAX_INPUT = 20 * 1024 * 1024
MAX_OUTPUT = 24 * 1024 * 1024
RENDER_LOCK = Lock()
MIMES = {"application/pdf", "image/jpeg", "image/png"}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None

def valid_url(url, tenant, output, env):
    if not isinstance(url, str) or len(url) > 2200 or not re.fullmatch(r"[-A-Za-z0-9_]{1,100}", tenant):
        return False
    account = env.get("R2_ACCOUNT_ID", "")
    bucket = env.get("R2_ATTACHMENTS_BUCKET", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
        return False
    try:
        u = urlsplit(url)
        if u.scheme != "https" or u.netloc != account + ".r2.cloudflarestorage.com" or u.fragment:
            return False
        prefix = "/" + bucket + ("/flip-pdf-temp/" + tenant + "/" if output else "/tenants/" + tenant + "/whatsapp/")
        if not u.path.startswith(prefix):
            return False
        suffix = u.path[len(prefix):]
        if not re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf" if output else r"[-A-Za-z0-9_]{1,100}", suffix):
            return False
        q = parse_qs(u.query, strict_parsing=True)
        allowed = {"X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires", "X-Amz-SignedHeaders", "X-Amz-Signature"}
        if set(q) != allowed or any(len(v) != 1 for v in q.values()):
            return False
        if q["X-Amz-Algorithm"] != ["AWS4-HMAC-SHA256"] or q["X-Amz-SignedHeaders"] != (["content-type;host"] if output else ["host"]):
            return False
        return 1 <= int(q["X-Amz-Expires"][0]) <= 180 and bool(re.fullmatch(r"[a-f0-9]{64}", q["X-Amz-Signature"][0]))
    except (ValueError, TypeError):
        return False

def validate_manifest(payload, env):
    if not isinstance(payload, dict) or set(payload) != {"tenantId", "files", "outputUrl"}:
        raise BundleError("Invalid manifest")
    tenant = payload["tenantId"]
    files = payload["files"]
    if not isinstance(tenant, str) or not isinstance(files, list) or not 1 <= len(files) <= 40 or not valid_url(payload["outputUrl"], tenant, True, env):
        raise BundleError("Invalid manifest")
    total = 0
    seen = set()
    for f in files:
        if not isinstance(f, dict) or set(f) != {"url", "mime", "size"} or not isinstance(f["mime"], str) or f["mime"] not in MIMES or type(f["size"]) is not int or not 1 <= f["size"] <= MAX_INPUT or not valid_url(f["url"], tenant, False, env):
            raise BundleError("Invalid file")
        path = urlsplit(f["url"]).path
        if path in seen:
            raise BundleError("Duplicate object")
        seen.add(path)
        total += f["size"]
    if total > MAX_INPUT:
        raise OverflowError("Input limit")
    return files, payload["outputUrl"]

def process(payload, env=os.environ, opener=None, expected_input_sha256=None):
    files, output = validate_manifest(payload, env)
    opener = opener or build_opener(ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + 85
    def timeout():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        return min(remaining, 15)
    sources = []
    for f in files:
        with opener.open(Request(f["url"], method="GET"), timeout=timeout()) as response:
            if response.status != 200 or response.headers.get("Content-Length") != str(f["size"]):
                raise BundleError("Invalid object size")
            data = bytearray()
            while len(data) <= f["size"]:
                timeout()
                chunk = response.read(min(65536, f["size"] + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
            if len(data) != f["size"]:
                raise BundleError("Object changed")
            raw = bytes(data)
            actual = sha256(raw).hexdigest()
            if expected_input_sha256 is not None and actual != expected_input_sha256:
                raise BundleError("Invalid synthetic fixture")
            sources.append(Source(raw, f["mime"], actual))
    result = build_bundle(sources)
    if len(result.pdf) > MAX_OUTPUT:
        raise OverflowError("Output limit")
    with opener.open(Request(output, data=result.pdf, method="PUT", headers={"Content-Type":"application/pdf"}), timeout=timeout()) as response:
        if response.status not in (200, 201, 204):
            raise BundleError("Upload failed")
    return {"sha256":result.output_sha256, "size":len(result.pdf), "pages":result.page_count}

QA_FIXTURE_SHA256 = "1fc478b876c24eba5daffb5c2cddb7cdbaa748795ad8fede80bc1c04aee21682"
QA_FIXTURE_SIZE = 329
QA_UUID = r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"

def r2_qa_enabled(env):
    return (env.get("FLIP_PDF_R2_TEST_ENABLED") == "1"
            and env.get("FLIP_PDF_QA_LIFECYCLE_VERIFIED") == "1"
            and env.get("FLIP_PDF_TRANSPORT_TEST_ENABLED") != "1"
            and env.get("GOJUS_PDF_R2_LIFECYCLE_VERIFIED") != "1"
            and env.get("VERCEL") == "1"
            and env.get("VERCEL_ENV") == "production"
            and re.fullmatch(r"flip-pdf-staging-[a-z0-9]+-agenciarhodes-2076s-projects\.vercel\.app", env.get("VERCEL_URL", "")) is not None
            and re.fullmatch(r"[a-f0-9]{32}", env.get("FLIP_PDF_QA_R2_ACCOUNT_ID", "")) is not None
            and env.get("FLIP_PDF_QA_R2_BUCKET") == "flip-pdf-qa")

def process_qa(payload, env, opener=None):
    if not r2_qa_enabled(env):
        raise BundleError("QA disabled")
    scoped = {"R2_ACCOUNT_ID": env["FLIP_PDF_QA_R2_ACCOUNT_ID"], "R2_ATTACHMENTS_BUCKET": "flip-pdf-qa"}
    files, _ = validate_manifest(payload, scoped)
    tenant = payload["tenantId"]
    if not re.fullmatch("qa-" + QA_UUID, tenant) or len(files) != 1:
        raise BundleError("Invalid QA scope")
    item = files[0]
    if item["mime"] != "image/png" or item["size"] != QA_FIXTURE_SIZE or not re.fullmatch(QA_UUID, urlsplit(item["url"]).path.rsplit("/", 1)[-1]):
        raise BundleError("Invalid QA fixture")
    return process(payload, scoped, opener, expected_input_sha256=QA_FIXTURE_SHA256)

def diagnostic_enabled(env):
    return (env.get("FLIP_PDF_TRANSPORT_TEST_ENABLED") == "1"
            and env.get("FLIP_PDF_R2_TEST_ENABLED") != "1"
            and env.get("GOJUS_PDF_R2_LIFECYCLE_VERIFIED") != "1"
            and env.get("VERCEL") == "1"
            and env.get("VERCEL_ENV") == "production"
            and re.fullmatch(r"flip-pdf-staging-[a-z0-9]+-agenciarhodes-2076s-projects\.vercel\.app", env.get("VERCEL_URL", "")) is not None)

def diagnostic_response(payload):
    if not isinstance(payload, dict) or set(payload) != {"diagnostic", "nonce"} or payload["diagnostic"] != "flip-pdf-transport-v1" or not isinstance(payload["nonce"], str) or not re.fullmatch(r"[a-f0-9]{32}", payload["nonce"]):
        raise BundleError("Invalid diagnostic")
    return {"ok": True, "synthetic": True, "nonce": payload["nonce"]}

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

    def do_POST(self):
        token = os.environ.get("GOJUS_PDF_WORKER_TOKEN", "")
        diagnostic = diagnostic_enabled(os.environ)
        qa = r2_qa_enabled(os.environ)
        test_requested = os.environ.get("FLIP_PDF_R2_TEST_ENABLED") == "1" or os.environ.get("FLIP_PDF_TRANSPORT_TEST_ENABLED") == "1"
        if (test_requested and not (qa or diagnostic)) or (not (qa or diagnostic) and os.environ.get("GOJUS_PDF_R2_LIFECYCLE_VERIFIED") != "1") or len(token) < 32 or not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + token).encode()):
            return self.reply(403, {"error":"unavailable"})
        if self.headers.get("Content-Type") != "application/json" or self.headers.get("Transfer-Encoding"):
            return self.reply(400, {"error":"invalid_request"})
        if not RENDER_LOCK.acquire(blocking=False):
            return self.reply(503, {"error":"busy"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= (256 if diagnostic else 8192 if qa else MAX_MANIFEST):
                return self.reply(413, {"error":"limit"})
            raw = self.rfile.read(n)
            if len(raw) != n:
                return self.reply(400, {"error":"invalid_request"})
            payload = json.loads(raw)
            result = diagnostic_response(payload) if diagnostic else process_qa(payload, os.environ) if qa else process(payload)
            return self.reply(200, result)
        except OverflowError:
            return self.reply(413, {"error":"limit"})
        except (BundleError, ValueError, TypeError):
            return self.reply(422, {"error":"invalid_manifest_or_file"})
        except Exception:
            return self.reply(503, {"error":"unavailable"})
        finally:
            RENDER_LOCK.release()
