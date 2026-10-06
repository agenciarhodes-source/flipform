from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_accepts_only_explicit_json_provider_media_types():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "function hasJsonContentType(response: Response)" in engine
    assert "mediaType === 'application/json'" in engine
    assert "mediaType.endsWith('+json')" in engine
    assert "JEV_RESPONSE_CONTENT_TYPE_INVALID" in engine


def test_content_type_is_checked_before_response_body_reading():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    request = engine.split("async function requestJev", 1)[1]
    assert request.index("hasJsonContentType(response)") < request.index("response.body.getReader()")
    assert request.index("controller.abort()") < request.index("response.body.getReader()")


def test_content_type_guard_preserves_activation_and_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    errors = read("lib/flip-ai/jev-errors.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "'JEV_RESPONSE_CONTENT_TYPE_INVALID'" in errors
    assert "response stream is aborted before its body is read" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr361*"))
