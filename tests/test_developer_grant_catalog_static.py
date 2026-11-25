"""Regression for the nullable global role in developer grant account catalog."""
from pathlib import Path

SOURCE = Path("app/api/admin/developer-access/route.ts").read_text(encoding="utf-8")


def test_developer_grant_catalog_includes_ordinary_accounts_with_null_global_role():
    assert "globalRole: null" in SOURCE
    assert "globalRole: { not: 'platform_admin' }" in SOURCE
    assert "where: { NOT: { globalRole: 'platform_admin' } }" not in SOURCE


def test_developer_grant_catalog_still_excludes_platform_admin_and_does_not_expose_passwords():
    assert "select: { id: true, email: true, name: true, mfaEnabledAt: true }" in SOURCE
    assert "passwordHash: true" not in SOURCE
