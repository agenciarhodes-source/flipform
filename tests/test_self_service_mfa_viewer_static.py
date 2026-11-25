"""All signed-in users, including viewer developer-grant holders, can enroll MFA."""
from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def test_personal_security_page_is_verified_but_not_owner_role_gated():
    page = read("app/(app)/account/security/page.tsx")
    assert "getVerifiedSession()" in page
    assert "redirect('/login')" in page
    assert "<MfaCard />" in page
    assert "BRANDING_VIEW" not in page


def test_personal_security_link_is_in_sidebar_and_profile_menu():
    shell = read("components/app-shell.tsx")
    assert 'href: "/account/security"' in shell
    assert '<Link href="/account/security">' in shell


def test_personal_mfa_works_even_if_business_module_access_is_limited():
    layout = read("app/(app)/layout.tsx")
    assert 'const isPersonalSecurityRoute = pathname === "/account/security"' in layout
    assert "!isPersonalSecurityRoute && !inboxPlanAllowsPath(pathname)" in layout
    assert "!isPersonalSecurityRoute) {" in layout


def test_enrollment_does_not_bypass_grants():
    verify = read("lib/session-access.ts")
    assert "mayUseDeveloperGrant({" in verify
    assert "mfaEnabled: !!account?.mfaEnabledAt" in verify
    page = read("app/(app)/account/security/page.tsx")
    assert "developerTenantGrant.create" not in page
