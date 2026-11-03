from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8").replace("\r\n", "\n")


def test_every_reply_gets_the_fixed_rules_of_the_published_file():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "import { extractFixedRules, fixedRulesPrompt } from './fixed-rules';" in chat
    assert "fixedRulesPrompt(fixedRules ? safeReference(fixedRules) : null)," in chat
    assert "assistantMessages, await loadFixedRules(turn.tenantId, turn.knowledgeIndexId))," in chat
    # Read from the revision of the published index, of the same company.
    assert "where: { id: knowledgeIndexId, tenantId }" in chat
    assert "where: { tenantId, documentId: index.documentId, revision: index.revision }" in chat


def test_no_path_rule_follows_the_company_fixed_rules_first():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "faça o que as REGRAS FIXAS DA'\n      + ' EMPRESA mandarem para esse caso" in reply
    assert "se elas não disserem nada, diga'\n      + ' que vai deixar anotado para a equipe analisar" in reply


def test_fixed_rules_test_runs_in_ci():
    assert "tests/flip-ai-fixed-rules.test.ts" in read(".github/workflows/ci.yml")
