from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_sanitizer_has_fixed_structural_limits_before_serialization():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    for guard in [
        "JEV_SANITIZER_MAX_DEPTH",
        "JEV_SANITIZER_MAX_ARRAY_ITEMS",
        "JEV_SANITIZER_MAX_OBJECT_ENTRIES",
        "JEV_SANITIZER_MAX_NODES",
    ]:
        assert guard in privacy
    request = engine.split("async function requestJev", 1)[1]
    assert request.index("sanitizeJevPayload(body)") < request.index("JEV_MAX_REQUEST_BYTES")


def test_jev_sanitizer_stops_cycles_and_non_json_values():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "new WeakSet<object>()" in privacy
    assert "seen.has(entry)" in privacy
    assert "typeof entry === 'bigint'" in privacy
    assert "!Number.isFinite(entry)" in privacy
    assert "[estrutura omitida]" in privacy


def test_sanitizer_bounds_do_not_change_activation_or_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "Sanitization is bounded before serialization" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr358*"))
