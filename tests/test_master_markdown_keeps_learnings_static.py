from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_saving_a_new_master_markdown_keeps_the_approved_learnings():
    learning = read("lib/flip/learning.ts")
    assert "export async function keepApprovedLearnings(tenantId: string, content: string) {" in learning
    assert "if (content.includes(LEARNING_SECTION)) return { content, restored: false };" in learning
    route = read("app/api/flip-ai/agents/[id]/knowledge/master/route.ts")
    assert "keepApprovedLearnings(session.tenantId," in route
    assert route.index("keepApprovedLearnings(") < route.index("saveMasterMarkdown(session, id.data, body)")
    editor = read("components/flip-ai/knowledge-master-editor.tsx")
    assert "data.learningsRestored" in editor
    assert "setContent(savedContent)" in editor
