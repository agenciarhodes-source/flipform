from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr329_openai_observability_is_platform_admin_only_and_read_only():
    route = read("app/api/admin/openai/observability/route.ts")
    source = read("lib/flip-ai/openai-admin-observability.ts")

    assert "withPlatformAdmin" in route
    assert "OPENAI_ADMIN_KEY" in route
    assert "OPENAI_OPERATIONAL_BALANCE_USD" in route
    assert "Authorization:" in source
    assert "/organization/costs" in source
    assert "/organization/usage/completions" in source
    assert "/organization/usage/embeddings" in source

    forbidden = [
        "prisma.",
        "$executeRaw",
        "$queryRaw",
        "POST /organization",
        "creditCard",
        "cvv",
        "auto-reload",
    ]
    for token in forbidden:
        assert token not in source


def test_pr329_never_exposes_admin_key_and_keeps_balance_explicitly_estimated():
    route = read("app/api/admin/openai/observability/route.ts")
    page = read("app/admin/(secure)/openai/page.tsx")
    layout = read("app/admin/(secure)/layout.tsx")

    assert "adminKey," in route
    assert "OPENAI_ADMIN_KEY:" not in route
    assert "Saldo operacional estimado" in page
    assert "Carteira Flip AI" in page
    assert "não representa" in page
    assert 'href="/admin/openai"' in layout


def test_pr329_has_no_migration_and_documents_optional_manual_balance():
    runbook = read("docs/flip-ai/PR-329-OPENAI-OBSERVABILITY-RUNBOOK.md")
    assert "nenhuma migration" in runbook
    assert "OPENAI_OPERATIONAL_BALANCE_USD" in runbook
    assert "não converte saldo OpenAI em créditos de cliente" in runbook
