from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_inbox_alone_gets_the_microphone_besides_the_public_chat():
    config = (ROOT / "next.config.js").read_text(encoding="utf-8")
    assert "camera=(), microphone=(), geolocation=()" in config
    assert config.count("microphone=(self)") == 3
    assert "source: '/inbox'," in config
    assert "source: '/inbox/:path*'," in config
    # The exceptions come after the general rule, so they win.
    assert config.index("source: '/inbox',") > config.index("source: '/(.*)',")


def test_recorder_explains_why_it_cannot_record():
    recorder = (ROOT / "components/inbox/voice-recorder.tsx").read_text(encoding="utf-8")
    assert "Nenhum microfone encontrado" in recorder
    assert "O microfone está em uso por outro programa" in recorder
