from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_bounds_sanitized_requests_before_network_io():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "JEV_MAX_REQUEST_BYTES = 256 * 1024" in engine
    assert "JSON.stringify(sanitizeJevPayload(body))" in engine
    assert "JEV_REQUEST_TOO_LARGE" in engine
    assert engine.index("JEV_REQUEST_TOO_LARGE") < engine.index("(options?.fetchImpl || fetch)")


def test_jev_streams_responses_through_a_hard_decoded_size_limit():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "JEV_MAX_RESPONSE_BYTES = 256 * 1024" in engine
    assert "response.body.getReader()" in engine
    assert "totalBytes > JEV_MAX_RESPONSE_BYTES" in engine
    assert "controller.abort()" in engine
    assert "JEV_RESPONSE_TOO_LARGE" in engine
    assert "response.json()" not in engine


def test_payload_limits_preserve_privacy_and_activation_gates():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "including when the provider omits or understates `Content-Length`" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr356*"))
