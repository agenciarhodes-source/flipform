from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_flip_suggestions_only_act_when_someone_applies():
    suggestions = read("lib/flip/suggestions.ts")
    assert "Nothing is applied here." in suggestions
    assert "if (!managers) return { ok: false as const, message: 'Só gestores aplicam transferências.' };" in suggestions
    assert "if (!conversation || !isWaitingForAnswer({ ...conversation, now })) {" in suggestions
    assert "action: done ? 'flip.suggestion_applied' : 'flip.suggestion_expired'," in suggestions
    assert "<FlipSuggestionsPanel onApplied={() => void reload()} />" in read("components/flip/alerts-board.tsx")
    migration = read("prisma/migrations/20261023120000_flip_suggestions/migration.sql")
    assert "DROP" not in migration
    assert "tests/flip-suggestion-rules.test.ts" in read(".github/workflows/ci.yml")


def test_suggestions_show_the_lead_and_can_be_decided_by_kind():
    panel = read("components/flip/suggestions-panel.tsx")
    assert "{item.leadName || BLOCKS[block.key].label}" in panel
    assert "window.confirm(question)" in panel
    bulk = read("lib/flip/suggestions.ts")
    assert "export async function decideFlipSuggestionsOfKind(" in bulk
    assert "await applyFlipSuggestion(session, item.id)" in bulk  # each one checked as if clicked alone

def test_flip_blocks_start_closed_with_counts_on_top():
    panel = read("components/flip/suggestions-panel.tsx")
    assert "const [open, setOpen] = useState<BlockKey | null>(null);" in panel
    assert "ids: list.map((item) => item.id)" in panel
    board = read("components/flip/alerts-board.tsx")
    assert "const [openKind, setOpenKind] = useState<FlipAlertKind | null>(null);" in board
    assert "{openKind === group.kind && <ul" in board
    assert "ids: z.array(" in read("app/api/flip/suggestions/bulk/route.ts")
