from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = "lib/flip-ai/top-up-funding.ts"
MIGRATION = "prisma/migrations/20261009190000_platform_top_up_funding/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_funding_mark_is_a_control_note_that_moves_no_money():
    lib = read(LIB)
    routes = read("app/api/admin/flip-ai/treasury/top-ups/route.ts") + read(
        "app/api/admin/flip-ai/treasury/top-ups/[id]/funding/route.ts")
    for forbidden in ["stripe", "Stripe", "flipAiCreditAccount", "flipAiCreditLedger", "recordFlipAiCreditEntry",
                      "api.openai.com", "OPENAI_API_KEY", "flipAiTopUpOrder.update", "flipAiTopUpOrder.delete"]:
        assert forbidden not in lib + routes, forbidden
    assert "export const GET = withPlatformAdmin" in routes
    assert "export const PUT = withPlatformAdmin" in routes
    assert "platform.top_up_funding_marked" in routes


def test_one_million_credits_is_one_dollar_of_provider_balance():
    lib = read(LIB)
    assert "Math.round((credits / 1_000_000) * 100) / 100" in lib
    assert "where: { status: 'credited' }," in lib


def test_list_keeps_working_before_the_table_exists():
    lib = read(LIB)
    assert "fundingAvailable = false;" in lib
    assert "error.code === 'P2021' || error.code === 'P2022'" in lib
    card = read("app/admin/(secure)/treasury/top-up-funding-card.tsx")
    assert "Recargas dos clientes" in card
    assert "Valor atribuído" in card
    assert "aguardando atribuição" in card
    assert "<TopUpFundingCard />" in read("app/admin/(secure)/treasury/page.tsx")


def test_migration_only_creates_one_table_outside_the_schema_contract_scan():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "ALTER TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("CREATE TABLE") == 1
    assert "flip_ai" not in Path(MIGRATION).parent.name
    assert '@@map("platform_top_up_funding")' in read("prisma/schema.prisma")


def test_purchase_notice_is_best_effort_and_sent_only_for_a_new_credit():
    route = read("app/api/webhooks/stripe/route.ts")
    assert "if (!result.reused && result.status === 'credited') {" in route
    assert "await notifyTopUpCredited({ orderId: verified.orderId }).catch(() => undefined);" in route
    assert route.index("applyVerifiedStripeTopUpPayment(verified)") < route.index("notifyTopUpCredited({")
    lib = read(LIB)
    assert "env.FLIP_AI_TOP_UP_NOTIFY_EMAIL" in lib
    assert "reason: 'not_configured'" in lib
    assert "FLIP_AI_TOP_UP_NOTIFY_EMAIL=" in read(".env.example")
