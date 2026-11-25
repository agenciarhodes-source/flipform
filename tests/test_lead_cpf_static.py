from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read(p):
    return (ROOT / p).read_text(encoding="utf-8")
def test_cpf_storage_and_feature_guards():
    s = read("lib/leads/cpf.ts")
    r = read("app/api/leads/[id]/cpf/route.ts")
    d = read("lib/whatsapp-ai/documents.ts")
    w = read("lib/whatsapp-ai/reply.ts")
    feature = read("lib/billing/tenant-features.ts")
    assert "encryptIntegrationSecret" in s and "createHmac('sha256'" in s
    assert "skipDuplicates: true" in s and "source !== 'team'" in s and ".upsert(" not in s
    assert "metadata: { source" in s and "metadata: { cpf" not in s
    assert "Cache-Control" in r and "no-store" in r and "canEditLead" in r and "403" in r
    assert r.count("tenantHasFeature(") == 2 and s.count("tenantHasFeature(") == 5
    assert "cpfEnabled && conversation" in d and "cpfEnabled && conversation" in w
    assert "onlyIfEmpty: true" in d and "onlyIfEmpty: true" in w
    assert "tenantId, feature, enabled: true" in feature and "catch { return false; }" in feature
    m = read("prisma/migrations/20261122120000_lead_personal_documents/migration.sql")
    assert "CREATE TABLE IF NOT EXISTS" in m and "DROP " not in m and 'ALTER TABLE "leads"' not in m
    assert "INSERT INTO" not in m
def test_cpf_does_not_leak_into_lead_model():
    schema = read("prisma/schema.prisma")
    lead = schema.split("model Lead {",1)[1].split("\n}",1)[0]
    assert "cpf" not in lead.lower()
    assert "lead_personal_documents" in schema

