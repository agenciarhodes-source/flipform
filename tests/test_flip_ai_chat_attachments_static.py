from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPLOAD = "lib/flip-ai/chat-attachment-upload.ts"
MESSAGES = "app/api/flip-ai/public/[slug]/messages/route.ts"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_browser_only_names_an_uploaded_file_and_the_server_describes_it():
    route = read(MESSAGES)
    assert "if ('attachment' in body) throw new Error('attachment_declared_by_client');" in route
    assert "body = { ...(body as Record<string, unknown>), attachment: attachmentInfo(attachment) };" in route
    assert route.index("claimUploadedChatAttachment({") < route.index("turn = await preparePublicChatTurn(")
    assert "formData" not in route


def test_uploaded_file_is_read_back_and_checked_before_it_is_used():
    upload = read(UPLOAD)
    claim = upload.split("export async function claimUploadedChatAttachment")[1].split("export async function attachUploadToTurn")[0]
    assert "sessionRef: attachmentSessionRef(input.sessionToken)," in claim
    assert "tenantId: input.tenantId," in claim
    assert "expiresAt: { gt: now }," in claim
    assert "validateChatAttachment({ name: row.name, bytes })" in claim
    assert "checked.attachment.sizeBytes !== row.sizeBytes" in claim
    # A file that is not what was declared is removed from storage at once.
    assert "await deleteAttachmentObject(storage.config, { key: row.objectKey })" in claim


def test_upload_link_is_limited_by_type_size_and_rate():
    upload = read(UPLOAD)
    issue = upload.split("export async function issueChatAttachmentUpload")[1].split("export async function claimUploadedChatAttachment")[0]
    assert "sizeBytes > FLIP_AI_ATTACHMENT_MAX_BYTES" in issue
    assert "FLIP_AI_ATTACHMENT_MIME_TYPES.find((type) => type === input.mimeType)" in issue
    assert "recent >= FLIP_AI_ATTACHMENT_UPLOADS_PER_HOUR" in issue
    assert "`tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, \'\')}/chat/${id}`" in issue
    assert "FLIP_AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;" in read("lib/flip-ai/chat-attachment.ts")
    route = read("app/api/flip-ai/public/[slug]/attachments/route.ts")
    assert "rateLimit({ key: `flip-ai:attachment:ip:" in route
    assert "issueChatAttachmentUpload({" in route


def test_session_cookie_is_never_stored_with_the_file():
    upload = read(UPLOAD)
    assert "createHash('sha256').update(sessionToken, 'utf8').digest('hex')" in upload
    assert "sessionToken:" not in upload.split("await prisma.chatAttachment.create({")[1].split("});")[0]


def test_unreadable_file_falls_back_to_a_normal_reply():
    route = read(MESSAGES)
    assert "OPENAI_RESPONSE_HTTP_4" in route
    assert "return call(withLastUserContent((text) => unreadableAttachmentNote(text, file)));" in route
    assert "if (!refused) throw error;" in route


def test_attendant_answers_the_message_and_confirms_what_arrived():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "responda à mensagem que veio com ele, não ao arquivo em si" in chat
    assert "confirme o recebimento em uma frase curta" in chat
    assert "Nunca afirme ter conferido algo que não conseguiu ler." in chat
    assert "registre em memoryPatch um fato curto com o que foi recebido" in chat


def test_attach_button_only_appears_when_storage_is_configured():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "{attachmentsEnabled && (" in shell
    assert 'aria-label="Anexar foto ou documento"' in shell
    assert "await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers || {}, body: attachedFile })" in shell
    assert "...(attachmentId ? { attachmentId } : {})," in shell
    for page in ["app/chat/[slug]/page.tsx", "app/custom-domain/chat/[slug]/page.tsx"]:
        assert "attachmentsEnabled={chatAttachmentsEnabled()}" in read(page), page
    assert "tests/flip-ai-chat-attachment.test.ts" in read(".github/workflows/ci.yml")
