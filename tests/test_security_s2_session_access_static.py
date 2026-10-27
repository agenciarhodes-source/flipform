from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_every_route_wrapper_checks_the_database():
    auth = read("lib/auth.ts")
    assert auth.count("const session = await getVerifiedSessionFromRequest(req);") == 2  # withAuth, withPlatformAdmin
    assert "const session = await getVerifiedSessionFromRequest(req);" in read("lib/rbac-server.ts")
    assert "const session = await getVerifiedSessionFromRequest(req);" in read("lib/flip-ai/http.ts")
    for name in ("forms", "leads", "overview", "switch"):
        assert "await getVerifiedSessionFromRequest(req)" in read(f"app/api/business-groups/{name}/route.ts")


def test_blocked_companies_stop_in_permission_routes_too():
    rbac = read("lib/rbac-server.ts")
    assert "if (!permissionWorksWhenBlocked(permission)) {" in rbac
    assert "code: 'tenant_blocked'" in rbac


def test_session_version_ends_old_tokens():
    assert "const token = signToken({ ...payload, sv });" in read("lib/auth.ts")
    assert "sessionVersion: { increment: 1 }" in read("app/api/auth/change-password/route.ts")
    assert "sessionVersion: { increment: 1 }" in read("app/api/auth/logout-all/route.ts")
    sql = read("prisma/migrations/20261101120000_user_session_version/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0' in sql


def test_layouts_use_the_verified_session():
    assert "const session = await getVerifiedSession();" in read("app/(app)/layout.tsx")
    assert "const session = await getVerifiedSession();" in read("app/admin/(secure)/layout.tsx")
