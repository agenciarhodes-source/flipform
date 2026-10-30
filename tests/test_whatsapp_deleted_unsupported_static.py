from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_inbox_names_deleted_and_undelivered_messages():
    client = read("app/(app)/inbox/inbox-client.tsx")
    assert "if (metadata.providerType === 'revoke') return 'A pessoa apagou uma mensagem.';" in client
    assert "if (metadata.providerType === 'unsupported') {" in client
    assert "{messageTypeLabel(message)}" in client


def test_deleted_message_does_not_wake_the_ai_and_keeps_meta_reasons():
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "if (message?.type !== 'revoke' && await hasWhatsAppAiOn(connection.id)) {" in runtime
    assert "revokedMessageId" in runtime
    assert "providerErrorCode: message.errors[0].code" in runtime


def test_ai_asks_to_resend_what_whatsapp_does_not_deliver():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "} else if (providerTypeOf(message.metadata) === 'unsupported') {" in reply
    assert "extraUserNotes.push(UNSUPPORTED_NOTE);" in reply
