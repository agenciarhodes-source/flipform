from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_form_sends_the_guard_and_has_a_hidden_field():
    view = read("app/f/[slug]/public-form-view.tsx")
    assert 'id="ff-contact-confirmation"' in view
    assert "tabIndex={-1}" in view and 'autoComplete="off"' in view
    assert "hp: honeypot.current?.value || ''" in view


def test_submit_route_limits_and_drops_robots_without_creating_leads():
    route = read("app/api/public/forms/[slug]/submit/route.ts")
    assert "key: `form-submit:${slug}:${getClientIp(req)}`" in route
    assert "const botReason = formBotReason(parsed.data.guard);" in route
    assert "action: 'form.bot_blocked', metadata: { reason: botReason }" in route
    assert route.index("const botReason") < route.index("prisma.$transaction") if "prisma.$transaction" in route else True
    assert "guard: z.object({" in read("lib/schemas.ts")
