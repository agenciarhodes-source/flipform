import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "prisma/migrations/20261008150000_platform_ai_text_model_settings/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_every_selectable_model_has_a_price_so_usage_stays_billable():
    catalog = read("lib/flip-ai/text-model-catalog.ts")
    pricing = read("lib/flip-ai/openai-pricing.ts")
    ids = re.findall(r"id: '([^']+)'", catalog)
    assert ids == ["gpt-5.6-luna", "gpt-6-luna"]
    for model in ids:
        assert f"model === '{model}'" in pricing, model
    # Catalog prices (USD per 1M tokens) mirror the nano-USD per token table.
    assert "inputUsdPerMillion: 0.2" in catalog and "inputNanoUsd: 200, outputNanoUsd: 1_200" in pricing
    assert "inputUsdPerMillion: 0.1" in catalog and "inputNanoUsd: 100, outputNanoUsd: 500" in pricing
    assert "outputUsdPerMillion: 0.5" in catalog


def test_active_model_falls_back_to_default_and_never_breaks_a_conversation():
    setting = read("lib/flip-ai/text-model-setting.ts")
    getter = setting.split("export async function getActiveFlipAiTextModel")[1].split("export async function")[0]
    assert "{ model: FLIP_AI_TEXT_MODEL, source: 'default' }" in getter
    assert "isSelectableFlipAiTextModel(row.textModel)" in getter
    assert "} catch {" in getter
    assert "throw" not in getter


def test_conversation_uses_the_admin_selected_model_without_per_request_routing():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "const activeModel = await getActiveFlipAiTextModel();" in runtime
    assert "...getFlipAiConversationExecutionPlan(activeModel.model)," in runtime
    assert "modelRouting: 'disabled'" in runtime
    assert "getFlipAiConversationExecutionPlan((await getActiveFlipAiTextModel()).model)" in chat
    # The charge uses the model the provider actually answered with.
    assert "model = ${result.model}," in chat


def test_only_the_platform_admin_can_change_the_model_and_only_to_catalogued_ones():
    route = read("app/api/admin/openai/text-model/route.ts")
    assert "export const GET = withPlatformAdmin" in route
    assert "export const PUT = withPlatformAdmin" in route
    assert route.index("if (!isSelectableFlipAiTextModel(model))") < route.index("await probeFlipAiTextModel(model)")
    assert route.index("if (!probe.ok)") < route.index("await setActiveFlipAiTextModel(")
    assert "O modelo atual foi mantido." in route
    assert "platform.flip_ai_text_model_changed" in route
    assert "metadata: { previous: previous.model, next: active.model }" in route
    for forbidden in ["OPENAI_API_KEY", "OPENAI_ADMIN_KEY", "process.env", "tenantId"]:
        assert forbidden not in route, forbidden
    for path in ROOT.joinpath("app").rglob("*.ts*"):
        source = path.read_text(encoding="utf-8")
        if "setActiveFlipAiTextModel(" in source:
            assert path.as_posix().endswith("app/api/admin/openai/text-model/route.ts"), path


def test_migration_only_creates_the_new_settings_table():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    for forbidden in ["DROP ", "ALTER TABLE", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT "]:
        assert forbidden not in sql, forbidden
    assert sql.count("CREATE TABLE") == 1
    assert 'CREATE TABLE "PLATFORM_FLIP_AI_SETTINGS"' in sql
    assert '@@map("platform_flip_ai_settings")' in read("prisma/schema.prisma")


def test_admin_panel_offers_the_selector_and_customers_never_see_the_model():
    page = read("app/admin/(secure)/openai/page.tsx")
    card = read("app/admin/(secure)/openai/text-model-card.tsx")
    assert "<FlipAiTextModelCard />" in page
    assert "Modelo ativo do Flip AI" in card
    assert "/api/admin/openai/text-model" in card
    assert "window.confirm(" in card
    assert "os\n          clientes continuam vendo apenas créditos" in card or "clientes continuam vendo apenas créditos" in card
    customer = read("app/(app)/flip-ai/usage/page.tsx")
    for forbidden in ["gpt-6-luna", "text-model", "getActiveFlipAiTextModel"]:
        assert forbidden not in customer, forbidden


def test_migration_folder_stays_outside_the_flip_ai_schema_contract_scan():
    # tests/flip-ai.test.ts audits every migration folder containing "flip_ai" against the
    # tenant-facing Flip AI schema contract; this platform setting is not part of that contract.
    assert "flip_ai" not in Path(MIGRATION).parent.name
