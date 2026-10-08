from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "prisma/migrations/20261008180000_platform_ai_operational_balance/migration.sql"
SETTING = "lib/flip-ai/operational-balance-setting.ts"
ROUTE = "app/api/admin/flip-ai/treasury/operational-balance/route.ts"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_panel_value_wins_and_server_variable_remains_the_fallback():
    setting = read(SETTING)
    resolver = setting.split("export async function resolveOpenAiOperationalBalanceReference")[1].split("export function")[0]
    assert "source: 'admin_panel'" in resolver
    assert "env.OPENAI_OPERATIONAL_BALANCE_USD, source: 'manual_server_configuration'" in resolver
    assert "} catch {" in resolver and "throw" not in resolver
    treasury = read("lib/flip-ai/treasury.ts")
    assert "await resolveOpenAiOperationalBalanceReference()" in treasury
    assert "parseOpenAiOperationalBalance(balanceReference.raw)" in treasury
    assert "process.env.OPENAI_OPERATIONAL_BALANCE_USD" not in treasury


def test_saving_the_reference_is_admin_only_audited_and_moves_no_money():
    route = read(ROUTE)
    assert "export const PUT = withPlatformAdmin" in route
    assert "parseOperationalBalanceInput(" in route
    assert "platform.openai_operational_balance_reference_changed" in route
    combined = route + read(SETTING)
    for forbidden in ["stripe", "Stripe", "flipAiCreditAccount", "flipAiCreditLedger", "recordFlipAiCreditEntry", "api.openai.com", "fetch(", "OPENAI_ADMIN_KEY", "OPENAI_API_KEY"]:
        assert forbidden not in combined, forbidden


def test_input_is_bounded_and_can_be_cleared():
    setting = read(SETTING)
    assert "if (value === null || value === '') return { ok: true, usd: null };" in setting
    assert "usd < 0 || usd > OPENAI_OPERATIONAL_BALANCE_MAX_USD" in setting
    assert "OPENAI_OPERATIONAL_BALANCE_MAX_USD = 100_000_000" in setting


def test_migration_only_adds_nullable_columns_outside_the_schema_contract_scan():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "NOT NULL", "CREATE TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("ADD COLUMN") == 2
    assert "flip_ai" not in Path(MIGRATION).parent.name
    schema = read("prisma/schema.prisma")
    assert 'operationalBalanceUsd       Decimal?  @map("operational_balance_usd") @db.Decimal(12, 2)' in schema


def test_setters_do_not_read_back_columns_they_do_not_own():
    assert "select: { id: true }," in read("lib/flip-ai/text-model-setting.ts")
    assert "select: { id: true }," in read(SETTING)


def test_treasury_page_lets_the_admin_type_the_balance_and_says_what_it_is():
    page = read("app/admin/(secure)/treasury/page.tsx")
    assert "/api/admin/flip-ai/treasury/operational-balance" in page
    assert "Salvar saldo" in page
    assert "A OpenAI não informa o saldo pré-pago por API." in page
    assert "Não movimenta dinheiro nem altera a" in page
    assert "Informado neste painel" in page
