from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_received_files_follow_the_attendant_profile():
    reply = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    # No fixed "the team will analyse it" for every attendant any more.
    assert "o conteúdo será analisado pela equipe" not in reply
    assert "export function receivedFilesNote(role: AttendantRole | undefined)" in reply
    assert "if (receivedFiles) extraUserNotes.push(receivedFilesNote(runtime.attendantRole));" in reply
    assert "diga quais ainda faltam e peça o próximo, um por vez" in reply
    assert "Não diga apenas que a equipe vai analisar enquanto ainda faltar documento." in reply
