from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_every_sign_in_kind_goes_through_the_code_when_on():
    login = read("app/api/auth/login/route.ts")
    assert login.count("const mfaGate = await startSessionOrMfa(") == 3  # Super Admin, group, company
    assert "setSessionCookie(" not in login
    for path in ("app/api/auth/complete-onboarding/route.ts", "app/api/public/onboarding/complete/route.ts",
                 "app/api/public/invites/[token]/accept/route.ts"):
        assert "setSessionCookieUnlessMfa(" in read(path), path


def test_codes_are_checked_once_and_rate_limited():
    server = read("lib/mfa/server.ts")
    assert "mfaLastCounter: { lt: counter }" in server
    verify = read("app/api/auth/mfa/verify/route.ts")
    assert "`mfa:user:${challenge.session.userId}`" in verify
    assert "action: 'auth.login_mfa'" in verify


def test_secrets_are_encrypted_and_migration_is_additive():
    assert "encryptIntegrationSecret(secret)" in read("app/api/auth/mfa/setup/route.ts")
    sql = read("prisma/migrations/20261103120000_user_mfa/migration.sql")
    assert sql.count("ADD COLUMN IF NOT EXISTS") == 5
    assert "DROP " not in sql


def test_screens():
    assert "<MfaLoginStep" in read("app/login/page.tsx")
    assert "<MfaLoginStep dark" in read("app/admin/login/page.tsx")
    assert "<MfaCard />" in read("components/settings-page-client.tsx")
    assert "<MfaCard />" in read("app/admin/(secure)/security/page.tsx")


def test_super_admin_can_turn_it_off_for_a_lost_phone():
    route = read("app/api/admin/tenants/[id]/users/[tenantUserId]/mfa-reset/route.ts")
    assert "export const POST = withPlatformAdmin(" in route
    assert "sessionVersion: { increment: 1 }" in route
    assert "action: 'platform.user_mfa_reset'" in route
    assert "Desligar 2 etapas" in read("app/admin/(secure)/tenants/[id]/page.tsx")
