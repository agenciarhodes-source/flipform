from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_logout_route_only_accepts_post():
    route = (ROOT / "app/api/auth/logout/route.ts").read_text(encoding="utf-8")
    assert "export async function POST()" in route
    assert "export async function GET" not in route


def test_no_page_links_to_the_logout_address():
    offenders = []
    for folder in ["app", "components"]:
        for path in (ROOT / folder).rglob("*.tsx"):
            if 'href="/api/auth/logout"' in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_admin_and_blocked_pages_use_the_post_logout_button():
    button = (ROOT / "components/logout-button.tsx").read_text(encoding="utf-8")
    assert "fetch('/api/auth/logout', { method: 'POST' })" in button
    assert '<LogoutButton' in (ROOT / "app/admin/(secure)/layout.tsx").read_text(encoding="utf-8")
    assert '<LogoutButton' in (ROOT / "app/billing/blocked/page.tsx").read_text(encoding="utf-8")
