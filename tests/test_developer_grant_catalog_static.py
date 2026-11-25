"""Technical account directory excludes general customer accounts."""
from pathlib import Path
SOURCE=Path("app/api/admin/developer-access/route.ts").read_text(encoding="utf-8")

def test_catalog_contains_only_technical_accounts_and_existing_grantees():
    assert "globalRole: 'developer_account'" in SOURCE
    assert "developerGrants: { some: {} }" in SOURCE
    assert "globalRole: { not: 'platform_admin' }" not in SOURCE

def test_catalog_does_not_expose_passwords():
    assert "select: { id: true, email: true, name: true, mfaEnabledAt: true }" in SOURCE
    assert "passwordHash: true" not in SOURCE
