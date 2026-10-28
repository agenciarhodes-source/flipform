from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_ai_provider_never_receives_document_numbers():
    source = read("lib/flip-ai/openai-responses.ts")
    assert "input: maskDocumentsInMessages(input.messages)," in source
    assert "store: false," in source


def test_form_documents_are_encrypted_and_shown_masked():
    assert "answer: protectDocumentAnswer(a.fieldType, a.value) as any," in read("app/api/public/forms/[slug]/submit/route.ts")
    assert "encrypted: encryptIntegrationSecret(value)," in read("lib/privacy/protect-answer.ts")
    assert "answers: lead.answers.map(publicLeadAnswer)" in read("app/api/leads/[id]/route.ts")
    reveal = read("app/api/leads/[id]/answers/[answerId]/document/route.ts")
    assert "action: 'lead.document_revealed'" in reveal
    assert "assertCanAccessLead(session, lead)" in reveal
    assert "revealDocument(a.id)" in read("components/lead-detail-modal.tsx")
