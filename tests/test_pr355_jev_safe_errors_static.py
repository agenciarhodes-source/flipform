from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_live_jev_never_persists_raw_exception_messages():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    policy = read("lib/flip-ai/jev-errors.ts")
    assert "safeJevErrorCode(error)" in engine
    assert "error.message.slice" not in engine
    assert "SAFE_JEV_ERROR_CODES" in policy
    assert "JEV_RUNTIME_FAILED" in policy


def test_readiness_and_live_runtime_share_the_same_closed_error_policy():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    assert "safeJevErrorCode(error, 'JEV_READINESS_FAILED')" in route
    assert "function safeErrorCode" not in route


def test_safe_error_pr_does_not_change_activation_or_customer_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "Raw exception messages are never returned or written" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr355*"))
