from pathlib import Path

CONFIG = (Path(__file__).resolve().parents[1] / "next.config.js").read_text(encoding="utf-8")


def test_page_may_play_audio_it_recorded_or_received_and_nothing_wider():
    assert "\"media-src 'self' blob:\"," in CONFIG
    assert "media-src *" not in CONFIG and "media-src 'self' blob: https:" not in CONFIG
    assert "\"default-src 'self'\"," in CONFIG
