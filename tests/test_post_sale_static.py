from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_post_sale_respects_hours_opt_outs_and_approved_templates():
    runner = read("lib/post-sale/runner.ts")
    assert "if (!isWithinSendingHours(now)) return" in runner
    assert "if (blocked.has(optOutPhone(lead.phone))) continue;" in runner
    assert "where: { tenantId: settings.tenantId, status: 'won', phone: { not: null } }," in runner
    assert "systemSender: {" in runner
    assert "isCronRequestAuthorized(req)" in read("app/api/internal/jobs/post-sale/route.ts")
    assert "if (isOptOutMessage(messageText)) {" in read("lib/meta/whatsapp-runtime.ts")
    migration = read("prisma/migrations/20261022120000_post_sale_messages/migration.sql")
    assert "DROP" not in migration and "\"progress_enabled\" BOOLEAN NOT NULL DEFAULT false" in migration
    assert "<AutomaticMessagesSwitch leadId={leadId} />" in read("components/lead-detail-modal.tsx")
    assert "tests/post-sale-rules.test.ts" in read(".github/workflows/ci.yml")
