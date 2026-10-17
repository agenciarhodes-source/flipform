from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_notices_show_below_the_top_bar():
    layout = (ROOT / "app/layout.tsx").read_text(encoding="utf-8")
    assert 'offset={{ top: 80, right: 16 }}' in layout
