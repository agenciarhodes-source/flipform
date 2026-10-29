from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = "if (!(await tenantHasMessagingPlan(session.tenantId))) return messagingPlanRequired();"


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_messaging_routes_require_pro():
    for path in [
        "app/api/inbox/conversations/route.ts",
        "app/api/conversations/[id]/messages/whatsapp/route.ts",
        "app/api/conversations/[id]/messages/whatsapp-audio/route.ts",
        "app/api/conversations/[id]/messages/whatsapp-template/route.ts",
        "app/api/conversations/[id]/messages/instagram/route.ts",
        "app/api/integrations/whatsapp/embedded-signup/config/route.ts",
        "app/api/integrations/whatsapp/embedded-signup/complete/route.ts",
        "app/api/integrations/instagram/connect/route.ts",
    ]:
        assert GATE in read(path), path
    assert read("app/api/inbox/leads/[id]/whatsapp-conversation/route.ts").count(GATE) == 2


def test_inbox_and_direct_pages_show_the_plan_notice():
    assert '<MessagingPlanNotice channel="whatsapp" />' in read("app/(app)/inbox/page.tsx")
    assert '<MessagingPlanNotice channel="instagram" />' in read("app/(app)/direct/page.tsx")


def test_ai_answers_only_for_premium_or_pilot():
    access = read("lib/billing/plan-access.ts")
    assert "canServeFlipAiPublic(" in access
    assert "isFlipAiPilotTenant(tenantId) && canServeFlipAiPilot(" in access
    for path in ["lib/whatsapp-ai/reply.ts", "lib/instagram-ai/reply.ts"]:
        assert "if (!(await tenantMayRunAiAttendant(input.tenantId))) return { replied: false, reason: 'plan_required' };" in read(path), path


def test_pricing_lists_both_lines():
    pricing = read("app/pricing/page.tsx")
    assert "'Atendimento WhatsApp e Instagram (manual)'" in pricing
    assert "'IA no WhatsApp, Instagram e chat do site'" in pricing
