"""The customer's CPF on the lead: encrypted, apart from the lead row, never logged, never replaced by the AI."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_cpf_is_encrypted_and_found_by_keyed_fingerprint():
    lib = read("lib/leads/cpf.ts")
    assert "cpfEncrypted: encryptIntegrationSecret(cpf)" in lib
    assert "crypto.createHmac('sha256', key).update(cpf)" in lib
    assert "metadata: { source: input.source }" in lib  # the audit log never has the number
    assert "if (current && (input.onlyIfEmpty || current.cpfHash === hash))" in lib
    assert "action: 'lead.cpf_viewed'" in lib


def test_cpf_is_not_on_the_lead_row():
    schema = read("prisma/schema.prisma")
    lead = schema.split("model Lead {", 1)[1].split("\n}", 1)[0]
    assert "cpf" not in lead.lower()
    sql = read("prisma/migrations/20261122120000_lead_personal_documents/migration.sql").upper()
    assert "CREATE TABLE IF NOT EXISTS" in sql
    statements = [line.strip() for line in sql.splitlines() if line.strip() and not line.strip().startswith("--")]
    for word in ("DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "TRUNCATE"):
        assert not any(line.startswith(word) for line in statements), word


def test_ai_fills_only_an_empty_cpf_from_documents_and_chat():
    documents = read("lib/whatsapp-ai/documents.ts")
    assert "source: 'document', onlyIfEmpty: true" in documents
    assert "holderCpf: { type: ['string', 'null'] }," in documents
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "source: 'chat', onlyIfEmpty: true" in reply


def test_full_cpf_only_for_who_edits_the_lead():
    route = read("app/api/leads/[id]/cpf/route.ts")
    assert "if (!canEdit) return NextResponse.json({ error: 'Sem permissão para ver o CPF completo.' }" in route
    assert "where: { id, tenantId: session.tenantId, ...getLeadScopeForRole(session) }," in route
    assert "'Cache-Control': 'no-store'" in route
