from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_documents_check_keeps_only_the_result_and_files_get_the_chat_7_day_copy():
    documents = read("lib/whatsapp-ai/documents.ts")
    assert "Only the result is stored; the file stays at Meta." in documents
    assert "Não transcreva dados pessoais do documento na resposta." in documents
    archive = read("lib/whatsapp-ai/media-archive.ts")
    assert "FLIP_AI_ATTACHMENT_RETENTION_DAYS * 86_400_000" in archive  # same 7 days as the chat
    assert "prisma.chatAttachment.create({" in archive
    assert "createAttachmentUploadUrl(storage.config" in archive
    assert "archiveWhatsAppMedia(media)" in read("app/api/webhooks/meta/whatsapp/route.ts")
    migration = read("prisma/migrations/20261021180000_whatsapp_ai_documents/migration.sql")
    assert "DROP" not in migration and "flip_ai_" not in migration


def test_documents_reach_the_ai_the_lead_card_and_the_stages():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "readWhatsAppDocument({" in reply and "conversationDocumentContext(input.tenantId, conversation.id)" in reply
    assert "conversationDocumentContext(input.tenantId, input.conversationId)" in read("lib/whatsapp-ai/stage-suggestions.ts")
    assert "<LeadDocumentsTab leadId={leadId} />" in read("components/lead-detail-modal.tsx")
    assert "withPermission('FLIP_AI_MANAGE'" in read("app/api/whatsapp-ai/document-checklists/route.ts")
    assert "tests/whatsapp-ai-document-rules.test.ts" in read(".github/workflows/ci.yml")
