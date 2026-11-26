from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p):return (ROOT/p).read_text(encoding="utf-8")
def test_gojus_card_is_developer_only_and_tenant_gated():
    page=read("app/(app)/integrations/page.tsx")
    assert "session.role === 'developer' && await tenantHasFeature(session.tenantId, 'gojus_robot') && <GoJusIntegrationCard />" in page
    assert "if (!can(session.role, 'INTEGRATIONS_VIEW'))" in page
def test_gojus_card_only_sends_credentials_to_protected_internal_route():
    card=read("app/(app)/integrations/gojus-integration-card.tsx")
    assert "DialogTrigger" in card and "DialogContent" in card
    assert "<fieldset disabled={!status?.available||busy}" in card
    assert "fetch('/api/integrations/gojus'" in card
    assert "localStorage" not in card and "sessionStorage" not in card
    assert "password.current.value=''" in card
    assert "Não representa sessão ativa" in card and "Acesso por navegador" in card
    assert (ROOT/"public/gojus-logo.svg").is_file()
def test_gojus_vault_and_worker_fail_closed():
    route=read("app/api/integrations/gojus/route.ts")
    vault=read("lib/gojus/login-vault.ts")
    worker=read("workers/gojus/login-worker.mjs")
    assert "session.role!=='developer'" in route and "'gojus_robot'" in route
    assert "sealCredential(JSON.stringify(login)" in vault and "binding(actor,row.id)" in vault
    assert "GOJUS_LOGIN_CONFIG_ENABLED!=='1'" in vault and "GOJUS_LOGIN_TEST_ENABLED!=='1'" in vault
    assert "enabled:false" in vault and "ciphertext:envelope.ciphertext" in vault
    assert "redirect:'error'" in vault and "private, no-store" in route
    assert "GOJUS_LOGIN_EGRESS_VERIFIED!=='1'" in worker
    assert "browser.close()" in worker and "127.0.0.1" in worker
    assert "getByRole('button',{name:'Pré-cadastrar cliente',exact:true})" in worker
    assert "submit.click()" in worker and "storageState" not in worker
    assert "providerId: { not: 'gojus_browser' }" in read("lib/universal-connectors/registry.ts")
