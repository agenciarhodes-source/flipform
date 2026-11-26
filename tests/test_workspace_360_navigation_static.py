from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read(path): return (ROOT / path).read_text(encoding="utf-8")
def test_pages_and_menu_share_verified_policy():
    shell=read("components/app-shell.tsx")
    for route,flag in [("flip-intelligence","intelligence"),("flip-ads","ads")]:
        page=read(f"app/(app)/{route}/page.tsx")
        assert f'"/{route}"' in shell
        assert f'workspace360.{flag}' in shell
        assert f"'/{route}'" in read("middleware.ts")
        assert 'getVerifiedSession()' in page
        assert f'getWorkspace360Access(session)).{flag}' in page
    assert 'workspace360={workspace360}' in read("app/(app)/layout.tsx")
def test_api_stays_behind_existing_entitlement():
    old_page=read("app/(app)/developer-api/page.tsx")
    assert 'getVerifiedSession()' in old_page
    assert "redirect('/integrations#flipform-api')" in old_page
    page=read("app/(app)/integrations/native-api-panel.tsx")
    assert 'apiV1PilotTenantAllowed(session.tenantId' in page
    assert 'mayManageApiV1Credentials' in page
    assert '{allowed && <ApiV1Card />}' in page
    combined=read("app/(app)/integrations/page.tsx")
    assert 'access.api &&' in combined and '<NativeApiPanel session={session} />' in combined
    shell=read("components/app-shell.tsx")
    assert 'label: "Integrações e API"' in shell
    assert 'href: "/developer-api"' not in shell
def test_intelligence_uses_native_counts_only():
    page=read("app/(app)/flip-intelligence/page.tsx")
    assert 'const tenantId = session.tenantId' in page
    assert page.count('count({ where: { tenantId') == 6
    assert 'searchParams' not in page
    assert 'metrics ?' in page
def test_ads_no_provider_execution():
    page=read("app/(app)/flip-ads/page.tsx")
    assert 'ainda não foram homologadas' in page
    assert 'fetch(' not in page
    assert 'prisma.' not in page
