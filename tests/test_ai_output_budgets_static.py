import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The text model reasons before it writes, and the reasoning comes out of the same output budget.
# A tight budget makes the answer come back cut off (OPENAI_RESPONSE_TRUNCATED) and the feature
# silently falls back or fails. Only the tokens actually used are billed, so these floors cost
# nothing when the model needs less.
MINIMUMS = {
    "lib/flip/ask.ts": [1_000, 1_000],  # reading the question, then writing the answer
    "lib/instagram-ai/image.ts": [800],
    "lib/lead-assistant/service.ts": [1_500],
    "lib/contracts/zapsign-signed.ts": [2_000],
    "lib/flip/briefing.ts": [2_000],
}


def budgets(path: str) -> list[int]:
    source = (ROOT / path).read_text(encoding="utf-8")
    return [int(value.replace("_", "")) for value in re.findall(r"maxOutputTokens: ([0-9_]+)", source)]


def test_reasoning_model_calls_keep_room_to_think_and_still_answer():
    for path, minimums in MINIMUMS.items():
        found = budgets(path)
        assert len(found) == len(minimums), (path, found)
        for value, minimum in zip(found, minimums):
            assert value >= minimum, (path, value, minimum)


def test_budgets_stay_bounded():
    # Bigger budgets do not turn into longer texts: each caller still cuts what it keeps.
    for path in MINIMUMS:
        for value in budgets(path):
            assert value <= 4_000, (path, value)
    assert ".slice(0, 1_200)" in (ROOT / "lib/flip/ask.ts").read_text(encoding="utf-8")
    assert ".slice(0, 400)" in (ROOT / "lib/instagram-ai/image.ts").read_text(encoding="utf-8")
    assert ".slice(0, 2_500)" in (ROOT / "lib/flip/briefing.ts").read_text(encoding="utf-8")
