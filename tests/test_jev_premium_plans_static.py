from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_can_cover_every_premium_plan_with_an_explicit_flag():
    decision = read("lib/flip-ai/decision-engine.ts")
    assert "if (input.planEntitled === true && parseJevPremiumPlans(input.premiumPlansRaw)) return true;" in decision
    # The global switch is still checked first.
    assert decision.index("if (!parseJevEnabled(input.enabledRaw)) return false;") < decision.index("parseJevPremiumPlans(input.premiumPlansRaw)) return true;")
    agent = read("lib/flip-ai/public-agent.ts")
    assert "accessMode: planAccess ? 'plan' : 'pilot'," in agent
    chat = read("lib/flip-ai/public-chat.ts")
    assert chat.count("planEntitled: runtime.accessMode === 'plan',") == 2
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "premiumPlansRaw: process.env.FLIP_AI_JEV_PREMIUM_PLANS," in engine
    assert "FLIP_AI_JEV_PREMIUM_PLANS=false" in read(".env.production.example")
