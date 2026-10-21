from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_inbox_has_a_filter_for_conversations_with_the_ai():
    inbox = (ROOT / "app/(app)/inbox/inbox-client.tsx").read_text(encoding="utf-8")
    assert "const [onlyAi, setOnlyAi] = useState(false);" in inbox
    assert "&& (!onlyAi || withAi(conversation))" in inbox
    assert "Com a IA ({aiTotal})" in inbox
    assert '<div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversas">' in inbox
