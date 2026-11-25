from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def test_signed_foundation_is_fail_closed_and_registered():
    send = read("lib/closing-documents/send.ts")
    rules = read("lib/closing-documents/signed-rules.ts")
    ci = read(".github/workflows/ci.yml")
    assert "tenantHasFeature(input.tenantId, 'closing_signed_check')" in send
    assert "signedCheckEnabled && result.status === 'sent'" in send
    assert "signedCheckEnabled ? { confirmedTemplates, sendComplete:" in send
    assert "if (!sendComplete || !mode" in rules
    assert "items.length>0 && items.every" in rules
    assert "tests/closing-signed-rules.test.ts" in ci

def test_signed_review_respects_scope_and_keeps_human_review():
    reader=read("lib/whatsapp-ai/documents.ts")
    review=read("lib/closing-documents/signed-review.ts")
    rules=read("lib/closing-documents/signed-review-rules.ts")
    assert "tenantHasFeature(tenantId,'closing_signed_check')" in review
    assert "direction:'inbound'" in review and "createdAt:{gte:sent.sentAt}" in review
    assert "closingTemplate" in reader and "closingItemKey(recognized.id)" in reader
    assert "complete:false as const" in rules and "reviewRequired:true as const" in rules
    assert "signedReview: review?.instruction" in read("lib/closing-documents/send.ts")
    assert "Contratos assinados" in read("components/lead-documents-tab.tsx")
