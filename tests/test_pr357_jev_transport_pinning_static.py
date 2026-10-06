from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_transport_is_pinned_and_never_follows_redirects():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'" in engine
    assert "(options?.fetchImpl || fetch)(JEV_ENDPOINT" in engine
    assert "redirect: 'error'" in engine
    assert "cache: 'no-store'" in engine
    assert "credentials: 'omit'" in engine
    assert "referrerPolicy: 'no-referrer'" in engine


def test_provider_url_cannot_be_injected_by_runtime_callers():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    request_options = engine.split("async function requestJev", 1)[1].split("): Promise<unknown>", 1)[0]
    assert "endpoint" not in request_options
    assert "url" not in request_options


def test_transport_pinning_preserves_activation_and_customer_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "HTTP redirects are never followed" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr357*"))
