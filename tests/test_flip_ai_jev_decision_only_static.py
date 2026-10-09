from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_is_decision_only_unless_context_steering_is_explicitly_enabled():
    engine = read("lib/flip-ai/decision-engine.ts")
    helper = engine.split("export function isJevContextSteeringEnabled")[1].split("export function")[0]
    assert "=== 'true'" in helper
    chat = read("lib/flip-ai/public-chat.ts")
    assert "isJevContextSteeringEnabled(process.env.FLIP_AI_JEV_CONTEXT_STEERING_ENABLED)" in chat
    assert "const contextSteeringEnabled = intelligentHarnessEnabled" in chat
    assert "FLIP_AI_JEV_CONTEXT_STEERING_ENABLED=false" in read(".env.example")


def test_retrieval_knowledge_and_history_follow_the_steering_flag_not_the_jev_gate():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "const retrievalQueries = contextSteeringEnabled" in chat
    assert "const harness = contextSteeringEnabled" in chat
    assert "const budgetedHistory = contextSteeringEnabled" in chat
    assert "content: contextSteeringEnabled ? content : content.slice(0, 2_500)," in chat
    for stale in [
        "const retrievalQueries = intelligentHarnessEnabled",
        "const harness = intelligentHarnessEnabled",
        "const budgetedHistory = intelligentHarnessEnabled",
    ]:
        assert stale not in chat, stale


def test_the_decision_itself_still_runs_under_the_jev_gate():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "if (!decision && intelligentHarnessEnabled) {" in chat
    assert "runJevConversationDecision" in chat
    assert "decisionEngine: decision ? 'jev' : null," in chat
