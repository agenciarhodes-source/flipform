from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_cost_panel_reads_meta_pricing_and_the_wallet_only():
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "const pricing = parseMetaPricing(status?.pricing);" in runtime
    assert "AND (metadata IS NULL OR metadata->'metaPricing' IS NULL)" in runtime
    costs = read("lib/costs/operation-costs.ts")
    assert "ledger.entry_type = 'debit'" in costs
    for write_call in (".create(", ".update(", ".delete("):
        assert write_call not in costs
    assert "usdToBrlRate" not in read("lib/costs/pricing.ts")  # kept in dollars
    page = read("app/(app)/whatsapp-ai/costs/page.tsx")
    assert "can(session.role, 'FLIP_AI_MANAGE')" in page
    assert "tests/operation-costs-pricing.test.ts" in read(".github/workflows/ci.yml")
