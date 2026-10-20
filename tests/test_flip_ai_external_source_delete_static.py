from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_external_sources_can_be_deleted():
    service = read("lib/flip-ai/external-sources.ts")
    assert "export async function deleteExternalSource(" in service
    assert "action: 'deleted'" in service
    route = read("app/api/flip-ai/agents/[id]/external-sources/[sourceId]/route.ts")
    assert "export const DELETE = withFlipAiSession" in route
    editor = read("components/flip-ai/external-sources-editor.tsx")
    assert "onClick={() => void remove(source)}" in editor
    assert "window.confirm(" in editor
    assert "não ativa busca na internet" not in editor
