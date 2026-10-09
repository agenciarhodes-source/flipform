from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_attachment_is_described_by_the_server_and_never_stored():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "validateChatAttachment({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })" in route
    assert "body = { ...payload, attachment: attachmentInfo(attachment) };" in route
    # A JSON request cannot claim an attachment it did not upload.
    assert "'attachment' in body) throw new Error('attachment_without_file');" in route
    lib = read("lib/flip-ai/chat-attachment.ts")
    for forbidden in ["prisma", "writeFile", "fetch(", "put("]:
        assert forbidden not in lib + route.split("const withLastUserContent")[1].split("const decision =")[0], forbidden
    chat = read("lib/flip-ai/public-chat.ts")
    assert "...(input.attachment ? { attachment: input.attachment } : {})," in chat
    assert "attachment.base64" not in chat and "file_data" not in chat


def test_unreadable_file_falls_back_to_a_normal_reply():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "OPENAI_RESPONSE_HTTP_4" in route
    assert "return call(withLastUserContent((text) => unreadableAttachmentNote(text, file)));" in route
    assert "if (!refused) throw error;" in route


def test_attendant_answers_the_message_and_confirms_what_arrived():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "responda à mensagem que veio com ele, não ao arquivo em si" in chat
    assert "confirme o recebimento em uma frase curta" in chat
    assert "Nunca afirme ter conferido algo que não conseguiu ler." in chat
    assert "registre em memoryPatch um fato curto com o que foi recebido" in chat


def test_chat_has_an_icon_only_attach_button_and_sends_the_file_as_multipart():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert 'aria-label="Anexar foto ou documento"' in shell
    assert "form.set('file', attachedFile);" in shell
    assert "requestInit = { method: 'POST', body: form };" in shell
    assert "(!input.trim() && !file)" in shell
    assert "tests/flip-ai-chat-attachment.test.ts" in read(".github/workflows/ci.yml")
