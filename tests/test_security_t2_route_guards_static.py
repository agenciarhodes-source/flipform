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
