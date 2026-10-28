from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "app/api"
SESSION_CALLS = ("setSessionCookie(", "startSessionOrMfa(", "setSessionCookieUnlessMfa(")

# Every route that signs someone in, and the proof of identity it must check first.
SIGN_IN_ROUTES = {
    "auth/login/route.ts": "verifyPassword(",
    "auth/mfa/verify/route.ts": "confirmUserMfaCode(",
    "auth/complete-onboarding/route.ts": "verifyOnboardingToken(",
    "public/onboarding/complete/route.ts": "verifyOnboardingToken(",
    "public/invites/[token]/accept/route.ts": "invite.expiresAt < new Date()",
    "business-groups/switch/route.ts": "getVerifiedSessionFromRequest(req)",
}


def test_the_register_route_that_signed_in_with_only_an_email_is_gone():
    # It created a session for any allowed e-mail without checking the password (or MFA).
    assert not (API / "auth/register/route.ts").exists()


def test_only_known_routes_create_a_session_and_each_checks_identity_first():
    found = {}
    for route in API.rglob("route.ts"):
        text = route.read_text(encoding="utf-8")
        if any(call in text for call in SESSION_CALLS):
            found[route.relative_to(API).as_posix()] = text
    assert set(found) == set(SIGN_IN_ROUTES), sorted(set(found) ^ set(SIGN_IN_ROUTES))
    for path, proof in SIGN_IN_ROUTES.items():
        text = found[path]
        assert proof in text, (path, proof)
        first_session = min(text.index(call) for call in SESSION_CALLS if call in text)
        assert text.index(proof) < first_session, path
