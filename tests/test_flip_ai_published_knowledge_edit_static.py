from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_master_markdown_and_external_sources_are_editable_while_published():
    manager = read("components/flip-ai/agent-draft-manager.tsx")
    assert "agent.status === 'draft' ? <Button variant=\"outline\" disabled={busy || !!editor || !!knowledgeAgentId || !!externalAgentId} onClick={() => setKnowledgeAgentId(agent.id)}" not in manager
    assert "onClick={() => setKnowledgeAgentId(agent.id)}" in manager
    assert "onClick={() => setExternalAgentId(agent.id)}" in manager
    knowledge = read("lib/flip-ai/knowledge.ts")
    assert "status: { in: ['draft', 'published'] } }, select: { id: true } });" in knowledge
    assert "requireDraftAgent" not in knowledge
    assert "status: { in: ['draft', 'published'] } }," in read("lib/flip-ai/indexing.ts")
    # Every save is still a new preserved revision, never an overwrite.
    assert "await db.flipAiKnowledgeRevision.create({ data: {" in knowledge
    assert "flipAiKnowledgeRevision.delete" not in knowledge


def test_public_chat_keeps_serving_the_last_processed_revision_while_a_new_one_is_pending():
    public_agent = read("lib/flip-ai/public-agent.ts")
    block = public_agent.split("const index = await prisma.flipAiKnowledgeIndex.findFirst({", 1)[1].split("if (!index) return null;", 1)[0]
    assert "status: 'completed'," in block
    assert "orderBy: { revision: 'desc' }," in block
    assert "revision: document.currentRevision" not in block
    assert "knowledgeRevision: index.revision," in public_agent
    # Publishing for the first time still requires the current revision to be processed.
    publication = read("lib/flip-ai/publication.ts")
    assert "revision: document.currentRevision," in publication
    editor = read("components/flip-ai/knowledge-master-editor.tsx")
    assert "O chat continua com a revisão anterior até você processar a base." in editor
    assert "Apagar conteúdo" in editor
