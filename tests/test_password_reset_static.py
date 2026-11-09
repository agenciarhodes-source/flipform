"""Forgotten password: reset by the company (people of this company only) or by the Super Admin."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_company_reset_is_limited_and_signs_the_person_out():
    route = read("app/api/users/[id]/password/route.ts")
    assert "withPermission('USERS_EDIT'" in route
    assert "prisma.tenantUser.count({ where: { userId: target.userId } })" in route
    assert "sessionVersion: { increment: 1 }" in route
    assert "newPassword" not in route.split("logAudit(", 1)[1]


def test_super_admin_reset_needs_a_reason_and_is_audited():
    route = read("app/api/admin/tenants/[id]/users/[tenantUserId]/password-reset/route.ts")
    assert "withPlatformAdmin(" in route
    assert "reason.length < 10" in route
    assert "action: 'platform.user_password_reset'" in route
    assert "sessionVersion: { increment: 1 }" in route
    assert "newPassword" not in route.split("logPlatformAudit(", 1)[1]


def test_buttons_on_both_screens():
    assert "Redefinir senha" in read("components/users-page-client.tsx")
    admin = read("app/admin/(secure)/tenants/[id]/page.tsx")
    assert "password-reset`}" in admin and "askReason" in admin
    dialog = read("components/password-reset-dialog.tsx")
    assert 'autoComplete="new-password"' in dialog
    assert "tests/password-reset-rules.test.ts" in read(".github/workflows/ci.yml")
