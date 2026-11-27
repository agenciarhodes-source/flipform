"""Security protocol T2: every API route has a known guard.

A route is either wrapped by one of the session guards (which check the session in the database,
the permission and the company), or it is listed below with the guard it must keep. A new route
without either fails this test.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "app/api"
METHODS = r"(GET|POST|PUT|PATCH|DELETE)"
WRAPPED = re.compile(rf"export const {METHODS} = (withPermission|withAuth|withPlatformAdmin|withFlipAiSession)\b")
HANDLER = re.compile(rf"export (?:async )?function {METHODS}\b|export const {METHODS} = |export \{{[^}}]*\b{METHODS}\b")

CRON = "isCronRequestAuthorized(req)"
VERIFIED = "getVerifiedSession"

# Routes that are not wrapped, and the guard each one must keep.
GUARDED = {
    # Super Admin screens and signed-in actions: session confirmed in the database.
    "admin/allowed-users/route.ts": "await getVerifiedSession()",
    "admin/allowed-users/[id]/route.ts": "await getVerifiedSession()",
    "admin/tenants/courtesy/route.ts": "await getVerifiedSession()",
    "auth/me/route.ts": "await getVerifiedSession()",
    # Global catalog raster images: verified platform admin OR authorized tenant session.
    # Dedicated guard permits the Admin preview as well as the tenant catalog.
    "integrations/catalog/icon/[id]/route.ts": "await getVerifiedSessionFromRequest(req)",
    "auth/logout-all/route.ts": VERIFIED,
    "auth/mfa/route.ts": VERIFIED,
    "auth/mfa/setup/route.ts": VERIFIED,
    "auth/mfa/enable/route.ts": VERIFIED,
    "auth/mfa/disable/route.ts": VERIFIED,
    "business-groups/forms/route.ts": VERIFIED,
    "business-groups/leads/route.ts": VERIFIED,
    "business-groups/overview/route.ts": VERIFIED,
    "business-groups/switch/route.ts": VERIFIED,
    # Signing in: password, code or signed token, with attempt limits.
    "auth/login/route.ts": "verifyPassword(",
    "auth/logout/route.ts": "clearSessionCookie()",
    "auth/mfa/verify/route.ts": "confirmUserMfaCode(",
    "auth/request-code/route.ts": "rateLimit(",
    "auth/verify-code/route.ts": "rateLimit(",
    "auth/complete-onboarding/route.ts": "verifyOnboardingToken(",
    "auth/first-access/validate/route.ts": "rateLimit(",
    "auth/first-access/complete/route.ts": "rateLimit(",
    "public/onboarding/complete/route.ts": "verifyOnboardingToken(",
    "public/invites/[token]/route.ts": "token",
    "public/invites/[token]/accept/route.ts": "invite.expiresAt < new Date()",
    # Scheduled jobs: the cron secret.
    "cron/billing-status/route.ts": CRON,
    "cron/billing-suspension/route.ts": CRON,
    "cron/chat-attachments/route.ts": CRON,
    "cron/google-conversions/route.ts": CRON,
    "internal/jobs/attendance-learning/route.ts": CRON,
    "internal/jobs/automation-core/route.ts": CRON,
    "internal/jobs/post-sale/route.ts": CRON,
    "internal/jobs/whatsapp-ai/route.ts": CRON,
    "health/readiness/route.ts": "INTERNAL_JOB_SECRET",
    "webhooks/whatsapp/message/route.ts": "INTERNAL_JOB_SECRET",
    # Webhooks: the provider's signature or token.
    "webhooks/meta/whatsapp/route.ts": "x-hub-signature",
    "webhooks/meta/instagram/route.ts": "x-hub-signature",
    # Flip Voice Twilio callbacks: verify provider HMAC before any DB or provider call.
    "flip-voice/twilio/inbound/route.ts": "validTwilioSignature(",
    "flip-voice/twilio/status/route.ts": "validTwilioSignature(",
    # Dedicated Twilio webhooks: signed provider payload required, never session-free.
    "flip-voice/whatsapp/permission/route.ts": "validTwilioSignature(",
    "flip-voice/whatsapp/inbound/route.ts": "validTwilioSignature(",
    "flip-voice/whatsapp/status/route.ts": "validTwilioSignature(",
    "flip-voice/whatsapp/outbound-twiml/route.ts": "validTwilioSignature(",
    "webhooks/stripe/route.ts": "constructEvent(",
    "webhooks/zapsign/[tenantId]/route.ts": "zapSignWebhookAuthorized(",
    # Public pages (forms, site chat, checkout): published content only, with attempt limits.
    "public/forms/[slug]/route.ts": "slug",
    "public/forms/[slug]/submit/route.ts": "rateLimit(",
    "public/checkout/route.ts": "rateLimit(",
    "flip-ai/public/[slug]/attachments/route.ts": "rateLimit(",
    "flip-ai/public/[slug]/messages/route.ts": "slug",
    "flip-ai/public/[slug]/realtime/session/route.ts": "slug",
    "flip-ai/public/[slug]/speech/route.ts": "rateLimit(",
    "health/route.ts": "GET",
    # PR629 temporary diagnostics: preview-only, exact branch, expiring bearer and QA database target.
    "pr629-qa/db-target/route.ts": "isPr629DbAttestationAllowed(process.env)",
    # Fixed synthetic diagnostic: protected immutable Vercel staging hostname, flags fail closed,
    # no customer input or database/R2 access; independent token remains server-only.
    "diagnostics/flip-pdf/route.ts": "stagingPdfDiagnosticAllowed(process.env,req.nextUrl.hostname)",
    "diagnostics/flip-pdf-r2/route.ts": "stagingPdfR2DiagnosticAllowed(process.env,req.nextUrl.hostname)",
    # PR01 Phase 1: always 404 when OFF; 503 when no M2M repository exists.
    "v1/status/route.ts": "apiV1Enabled(process.env)",
    # M2M route: bearer identity, tenant entitlement and distributed quota on every GET.
    "v1/capabilities/route.ts": "authorizeApiV1Request({",
    # Scoped read-key introspection: same M2M entitlement and quota guard.
    "v1/credential-identity/route.ts": "authorizeApiV1Request({",
    # PR02: independently authenticated M2M bearer, tenant entitlement and quota.
    "v1/pipelines/route.ts": "authorizeApiV1Request({",
    # PR02 aggregate metrics: separate M2M scope and tenant-bound quota on every GET.
    "v1/pipelines/[pipelineId]/metrics/route.ts": "authorizeApiV1Request({",
    # PR02 forms metadata: no session bypass; independently verified M2M token.
    "v1/forms/route.ts": "authorizeApiV1Request({",
    "v1/forms/[formId]/fields/route.ts": "authorizeApiV1Request({",
    # PR02 lead metadata: never trust tenant inputs, authenticate M2M with a separate scope.
    "v1/leads/route.ts": "authorizeApiV1Request({",
    "v1/leads/[leadId]/route.ts": "authorizeApiV1Request({",
    # Test helper: answers only when NODE_ENV is "test".
    "test/otp/latest/route.ts": "process.env.NODE_ENV !== 'test'",
    # Same handlers as integrations/events (withPermission).
    "integrations/kanban-events/route.ts": "from '../events/route'",
}


def routes():
    for route in sorted(API.rglob("route.ts")):
        yield route.relative_to(API).as_posix(), route.read_text(encoding="utf-8")


def test_every_route_is_wrapped_or_has_a_listed_guard():
    unguarded = []
    for path, text in routes():
        if not HANDLER.search(text):
            continue
        handlers = len(re.findall(rf"export (?:async )?function {METHODS}\b|export const {METHODS} = ", text))
        wrapped = len(WRAPPED.findall(text))
        if handlers and wrapped == handlers:
            assert path not in GUARDED, f"{path} is wrapped now: remove it from GUARDED"
            continue
        if path not in GUARDED:
            unguarded.append(path)
            continue
        assert GUARDED[path] in text, (path, GUARDED[path])
    assert not unguarded, f"Routes without a known guard: {unguarded}"



def test_pr01_v1_status_never_opens_without_real_m2m_repository():
    route = (API / "v1/status/route.ts").read_text(encoding="utf-8")
    assert "if (!apiV1Enabled(process.env))" in route
    assert "apiV1Error('api_unavailable', 404)" in route
    assert "apiV1Error('dependency_unavailable', 503)" in route
    assert "prisma." not in route
    assert "fetch(" not in route
    assert "NextResponse.json({ ok: true" not in route


def test_pr629_temporary_db_diagnostic_is_fail_closed():
    source = (API / "pr629-qa/db-target/route.ts").read_text(encoding="utf-8")
    assert "if (!isPr629DbAttestationAllowed(process.env) || !authorized(req))" in source
    assert "if (!pr629DbTargetsMatchApprovedQa(process.env))" in source
    assert "timingSafeEqual(expectedBytes, suppliedBytes)" in source
    assert "SELECT current_database()::text AS database_name" in source
    assert "prisma.$queryRaw" in source


def test_listed_routes_still_exist():
    existing = {path for path, _ in routes()}
    assert not set(GUARDED) - existing, sorted(set(GUARDED) - existing)


def test_no_route_trusts_the_token_alone_for_access():
    # The 7-day cookie only says who signed in; access is always confirmed in the database (S2).
    for path, text in routes():
        if path == "auth/logout/route.ts":
            continue
        assert "await getSession()" not in text, path


def test_super_admin_screens_confirm_the_session_in_the_database():
    for path in ["admin/allowed-users/route.ts", "admin/allowed-users/[id]/route.ts", "admin/tenants/courtesy/route.ts"]:
        text = (API / path).read_text(encoding="utf-8")
        assert "getVerifiedSession" in text and "globalRole !== 'platform_admin'" in text or "globalRole === 'platform_admin'" in text, path


def test_cron_routes_check_the_secret_before_working():
    for path, guard in GUARDED.items():
        if guard != CRON:
            continue
        text = (API / path).read_text(encoding="utf-8")
        assert "if (!isCronRequestAuthorized(req))" in text, path


def test_global_catalog_icon_guard_precedes_database_read():
    source = (API / "integrations/catalog/icon/[id]/route.ts").read_text(encoding="utf-8")
    assert source.index("await getVerifiedSessionFromRequest(req)") < source.index("if(!session ||") < source.index("await prisma.platformCatalogApp.findUnique")
    assert "session.globalRole!=='platform_admin'" in source
    assert "!session.tenantId || !can(session.role,'INTEGRATIONS_VIEW')" in source
    assert "return new NextResponse(null,{status:403})" in source
    assert "validateIcon(row.iconPng)" in source
    assert "checked.iconDigest!==row?.iconDigest" in source
    assert "'Content-Type':'image/png'" in source and "'X-Content-Type-Options':'nosniff'" in source
    assert not re.search(r"export (?:async )?function (POST|PUT|PATCH|DELETE)\b|export const (POST|PUT|PATCH|DELETE)\s*=", source)


def test_flip_pdf_diagnostic_is_staging_only_and_does_not_access_customer_data():
    route = (API / "diagnostics/flip-pdf/route.ts").read_text(encoding="utf-8")
    guard = (ROOT / "lib/gojus/worker-transport.ts").read_text(encoding="utf-8").split("export function stagingPdfDiagnosticAllowed", 1)[1]
    assert "if(!stagingPdfDiagnosticAllowed(process.env,req.nextUrl.hostname))" in route
    assert route.index("if(!stagingPdfDiagnosticAllowed") < route.index("await fetch(")
    assert "if(!url||!headers)" in route
    assert route.index("if(!url||!headers)") < route.index("await fetch(")
    assert "host!=='flip-pdf-staging.vercel.app'" in route
    assert "req.headers.get('x-vercel-oidc-token')" in route
    assert "redirect:'error'" in route and "AbortSignal.timeout(" in route
    assert "randomBytes(16)" in route and "result?.nonce!==nonce" in route
    assert "r2Tested:false" in route
    assert "prisma" not in route and "resolveAttachmentStorage" not in route
    assert "req.json(" not in route and "req.text(" not in route
    assert "FLIP_PDF_TRANSPORT_TEST_ENABLED==='1'" in guard
    assert "GOJUS_PDF_WORKER_ENABLED!=='1'" in guard
    assert "GOJUS_PDF_R2_LIFECYCLE_VERIFIED!=='1'" in guard
    assert "VERCEL_ENV==='production'" in guard
    assert "flipform-staging-" in guard and "hostname===env.VERCEL_URL" in guard

def test_r2_qa_does_not_use_operational_storage_or_customer_input():
    route=(API/"diagnostics/flip-pdf-r2/route.ts").read_text(encoding="utf-8")
    qa=(ROOT/"lib/gojus/r2-qa.ts").read_text(encoding="utf-8")
    assert route.index("if(!stagingPdfR2DiagnosticAllowed") < route.index("await runR2Qa(")
    assert "req.nextUrl.searchParams.get('run')!=='1'" in route
    assert "req.headers.get('x-vercel-oidc-token')" in route
    assert "prisma" not in route and "prisma" not in qa
    assert "config.bucket!=='flip-pdf-qa'" in qa and "FLIP_PDF_QA_R2_SECRET_ACCESS_KEY" in qa
    assert "env.R2_ACCESS_KEY_ID" not in qa and "env.R2_SECRET_ACCESS_KEY" not in qa
    assert "randomUUID()" in qa and "digest(original)!==FIXTURE_HASH" in qa
    assert "digest(output)!==result.sha256" in qa
    assert "head.status===404" in qa and "Promise.allSettled" in qa
