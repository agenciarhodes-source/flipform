from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_failed_status_keeps_metas_reason_and_inbox_shows_it():
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "const failure = status.status === 'failed' ? parseWhatsAppFailure(status?.errors) : null;" in runtime
    reasons = read("lib/meta/whatsapp-failure-reasons.ts")
    assert "'131042'" in reasons and "'131049'" in reasons and "'132001'" in reasons
    assert "{failureReason(message.metadata)}" in read("app/(app)/inbox/inbox-client.tsx")
