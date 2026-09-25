from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_public_agent_signature_has_three_tenant_modes_and_safe_default():
    helper = read('lib/meta/whatsapp-agent-signature.ts')
    assert "['disabled', 'handoff', 'always']" in helper
    assert "return { mode: 'disabled', schemaReady: false }" in helper
    assert "previousOutboundSenderId !== input.senderUserId" in helper
    assert "input.mode === 'always'" in helper
    assert "· Atendente" in helper
    assert "message_limit" in helper
    assert "MAX_WHATSAPP_TEXT_LENGTH = 4096" in helper


def test_public_signature_does_not_expose_internal_role_to_customer():
    helper = read('lib/meta/whatsapp-agent-signature.ts')
    outbound = read('lib/meta/whatsapp-outbound.ts')
    assert "senderRole" not in helper
    assert "Dono" not in helper
    assert "Administrador" not in helper
    assert "Gestor" not in helper
    assert "agentSignature" in outbound
    assert "sentByUserId: requestedByUserId" in outbound


def test_outbound_keeps_internal_text_and_only_transforms_provider_payload():
    outbound = read('lib/meta/whatsapp-outbound.ts')
    assert "text," in outbound
    assert "agentSignature: signature.signature" in outbound
    assert "const providerText = begun.metadata.agentSignature" in outbound
    assert "text: providerText" in outbound
    assert "text: begun.row.text || ''" not in outbound.split("const providerText", 1)[1].split("if (provider.kind", 1)[0]
    assert "runTrackingAfterSend({" in outbound
    assert "text: begun.row.text || ''" in outbound


def test_signature_settings_are_tenant_scoped_rbac_protected_and_audited():
    route = read('app/api/inbox/whatsapp-settings/route.ts')
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert "where: { tenantId: session.tenantId }" in route
    assert "tenantId: session.tenantId" in route
    assert "whatsapp.agent_signature_mode_updated" in route
    assert "WHATSAPP_AGENT_SIGNATURE_SCHEMA_NOT_READY" in route


def test_signature_schema_change_is_additive_and_non_destructive():
    migration = read('prisma/migrations/20260925042000_add_tenant_whatsapp_agent_signature_settings/migration.sql').upper()
    assert 'CREATE TABLE IF NOT EXISTS "TENANT_WHATSAPP_SETTINGS"' in migration
    assert "ON DELETE CASCADE" in migration
    for destructive in ('DROP TABLE', 'DROP COLUMN', 'TRUNCATE ', 'DELETE FROM ', 'UPDATE LEADS SET'):
        assert destructive not in migration


def test_integrations_ui_exposes_recommended_handoff_mode():
    client = read('app/(app)/integrations/integrations-client.tsx')
    assert "Identificação do atendente no WhatsApp" in client
    assert "Ao iniciar ou trocar de atendente — recomendado" in client
    assert '<option value="disabled">Desativado</option>' in client
    assert '<option value="handoff">' in client
    assert '<option value="always">Em todas as mensagens</option>' in client
    assert "O papel interno (Dono, Administrador, Gestor etc.) não é exposto ao cliente." in client
