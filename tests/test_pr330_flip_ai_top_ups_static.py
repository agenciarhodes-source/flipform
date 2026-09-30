from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr330_migration_is_additive_tenant_scoped_and_payment_gated():
    sql = read("prisma/migrations/20260930210000_flip_ai_commercial_top_ups/migration.sql")

    assert 'CREATE TABLE "flip_ai_top_up_orders"' in sql
    assert '"tenant_id" TEXT NOT NULL' in sql
    assert '"status" IN (\'pending\', \'paid\', \'credited\', \'canceled\')' in sql
    assert '"amount_cents" > 0' in sql
    assert '"credits" > 0' in sql
    assert '"estimated_openai_cost_cents" >= 0' in sql
    assert 'ON DELETE RESTRICT' in sql
    assert 'flip_ai_top_up_orders_tenant_id_request_key_key' in sql

    destructive = ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM", "UPDATE leads", "UPDATE conversations"]
    for token in destructive:
        assert token.lower() not in sql.lower()


def test_pr330_crediting_requires_paid_order_and_reuses_wallet_ledger():
    source = read("lib/flip-ai/top-ups.ts")

    assert "order.status !== 'paid'" in source
    assert "FLIP_AI_TOP_UP_NOT_PAID" in source
    assert "idempotencyKey: `top-up:${order.id}`" in source
    assert "source: 'top_up'" in source
    assert "referenceId: order.id" in source
    assert "recordFlipAiCreditEntryWithDb(db, mutation)" in source
    assert "WHERE tenant_id = ${tenantId} AND id = ${orderId}" in source
    assert "FOR UPDATE" in source


def test_pr330_admin_routes_do_not_create_real_gateway_payments():
    collection = read("app/api/admin/tenants/[id]/flip-ai-top-ups/route.ts")
    item = read("app/api/admin/tenants/[id]/flip-ai-top-ups/[orderId]/route.ts")
    page = read("app/admin/(secure)/tenants/[id]/page.tsx")

    assert "withPlatformAdmin" in collection
    assert "withPlatformAdmin" in item
    assert "Criar recarga pendente" in page
    assert "Nenhum pagamento é criado no Asaas por esta tela." in page

    combined = collection + item + page
    for forbidden in ["createPayment(", "creditCard", "cvv", "autoRecharge", "auto-reload"]:
        assert forbidden not in combined


def test_pr330_runbook_preserves_manual_migration_policy():
    runbook = read("docs/flip-ai/PR-330-COMMERCIAL-TOP-UPS-RUNBOOK.md")

    assert "não executa migrate deploy em produção" in runbook
    assert "não cria cobrança no Asaas" in runbook
    assert "valor comercial cobrado do cliente em BRL" in runbook
    assert "custo bruto estimado da OpenAI em USD" in runbook
