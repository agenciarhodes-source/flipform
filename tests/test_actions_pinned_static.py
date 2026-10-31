import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USES = re.compile(r"^\s*-?\s*uses:\s*(\S+)", re.MULTILINE)


def test_every_github_action_is_pinned_to_a_full_commit_sha():
    # A tag (v5) can be moved to other code; a 40-character commit SHA cannot (risk R10).
    for workflow in sorted((ROOT / ".github/workflows").glob("*.yml")):
        for action in USES.findall(workflow.read_text(encoding="utf-8")):
            if action.startswith("./") or action.startswith("docker://"):
                continue
            assert re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", action), f"{workflow.name}: {action}"
