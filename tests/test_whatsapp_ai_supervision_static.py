from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_supervision_reviews_on_open_and_never_changes_the_conversation():
    reviews = read("lib/whatsapp-ai/reviews.ts")
    assert "if (reviewed >= REVIEWS_PER_OPEN) break;" in reviews
    assert "Não copie dados pessoais" in reviews
    for forbidden in ("message.update", "conversation.update", "enqueueAndDispatch"):
        assert forbidden not in reviews
    page = read("app/(app)/whatsapp-ai/review/page.tsx")
    assert "can(session.role, 'FLIP_AI_MANAGE')" in page
    assert "kind: 'ai_review_problem'," in read("lib/flip/alerts.ts")
    migration = read("prisma/migrations/20261023150000_whatsapp_ai_conversation_reviews/migration.sql")
    assert "DROP" not in migration
    assert "whatsapp_ai_conversation_reviews" not in read("lib/flip-ai/schema-contract.ts")
    assert "tests/whatsapp-ai-review-rules.test.ts" in read(".github/workflows/ci.yml")
