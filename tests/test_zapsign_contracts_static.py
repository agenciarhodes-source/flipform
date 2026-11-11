"""Contracts by ZapSign: released per company, token encrypted, link sent once, nothing sensitive kept."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_migration_is_additive_and_starts_off():
    sql = read("prisma/migrations/20261110120000_zapsign_contracts/migration.sql")
    import re
    statements = re.sub(r"ON (DELETE|UPDATE) (CASCADE|SET NULL)", "", sql.upper())
    for word in ["DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "TRUNCATE"]:
        assert word not in statements
    assert '"allowed" BOOLEAN NOT NULL DEFAULT false' in sql
    assert '"enabled" BOOLEAN NOT NULL DEFAULT false' in sql


def test_token_is_encrypted_and_never_returned():
    lib = read("lib/contracts/zapsign.ts")
    assert "encryptIntegrationSecret(input.apiToken)" in lib
    route = read("app/api/contracts/zapsign/route.ts")
    assert "hasToken: settings.hasToken" in route
    assert "api_token" not in route and "apiTokenEncrypted" not in route


def test_one_contract_per_conversation_and_only_when_complete():
    lib = read("lib/contracts/zapsign.ts")
    assert "status.every((item) => item.status === 'received')" in lib
    assert "WHERE NOT EXISTS (" in lib
    assert "idempotencyKey: `contract-${contractId}`" in lib
    # FlipForm never copies CPF or address: the customer fills them in ZapSign.
    rules = read("lib/contracts/zapsign-rules.ts")
    assert "signer_has_incomplete_fields: true" in rules


def test_whatsapp_reply_sends_the_link_after_the_answer():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "if (contractDue) extraUserNotes.push(CONTRACT_COMING_NOTE);" in reply
    assert reply.index("const sent = voiceSent || await enqueueAndDispatchWhatsAppTextMessage({") < reply.index("await sendContractIfReady(")


def test_release_and_settings_screens():
    assert "withPlatformAdmin(" in read("app/api/admin/tenants/[id]/zapsign/route.ts")
    assert "withPermission('CONTRACTS_MANAGE'" in read("app/api/contracts/zapsign/route.ts")
    assert "CONTRACTS_MANAGE: ['owner', 'admin']," in read("lib/rbac.ts")
    assert "<ZapSignSettingsCard />" in read("app/(app)/whatsapp-ai/page.tsx")
    assert "tests/zapsign-rules.test.ts" in read(".github/workflows/ci.yml")
