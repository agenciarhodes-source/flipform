from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_route_wrappers_resolve_next15_params():
    helper = read("lib/http/route-context.ts")
    assert "export async function resolveRouteContext<T>(ctx: T): Promise<T>" in helper
    for path in ("lib/auth.ts", "lib/rbac-server.ts", "lib/flip-ai/http.ts"):
        source = read(path)
        assert "const ctx = await resolveRouteContext(rawCtx as T);" in source, path


def test_no_temporary_sync_request_api_left():
    for folder in ("app", "lib", "components"):
        for file in (ROOT / folder).rglob("*.ts*"):
            text = file.read_text(encoding="utf-8", errors="ignore")
            assert "UnsafeUnwrapped" not in text, file
            assert "@next-codemod-error" not in text, file


def test_session_cookie_is_read_and_cleared_async():
    auth = read("lib/auth.ts")
    assert "export async function clearSessionCookie()" in auth
    assert "const token = await readCookieToken();" in auth
    assert "await clearSessionCookie();" in read("app/api/auth/logout/route.ts")
    assert "serverExternalPackages: ['mongodb']" in read("next.config.js")
