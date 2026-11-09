"""Voice notes recorded in the Inbox must not go through the browser's call filters (robotic voice)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_recorder_turns_off_call_filters_and_records_mono():
    src = (ROOT / "components/inbox/voice-recorder.tsx").read_text(encoding="utf-8")
    assert "noiseSuppression: { ideal: false }" in src
    assert "echoCancellation: { ideal: false }" in src
    assert "channelCount: { ideal: 1 }" in src
    assert "getUserMedia({ audio: VOICE_NOTE_AUDIO })" in src
    assert "audioBitsPerSecond: VOICE_NOTE_BITS_PER_SECOND" in src
    # "ideal" never makes the microphone fail; only "exact" would.
    assert "exact" not in src
