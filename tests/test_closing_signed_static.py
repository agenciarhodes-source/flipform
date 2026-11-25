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

def test_signed_task_is_atomic_and_owner_approval_is_scoped():
    service=read("lib/closing-documents/signed-task.ts")
    route=read("app/api/leads/[id]/closing-return-mode/route.ts")
    assert "FOR UPDATE" in service and "tenant_id = " in service
    assert "prisma.$transaction" in service and "tx.task.create" in service and "tx.auditLog.create" in service
    assert "state.taskCreated" in service and "closing_documents.all_signed" in service
    assert "status.modeApproved" in service and "status.complete" in service
    assert "urgent:true" in service and "priority:'high'" in service
    assert "tenantHasFeature(session.tenantId,'closing_signed_check')" in route
    assert "session.role!=='owner'" in route and "role:'owner',status:'active'" in service
    assert "state.sent.sentId!==input.sentId" in service
    assert "ensureSignedClosingTask(" in read("lib/whatsapp-ai/reply.ts")
    assert "cpf" not in service.lower()
