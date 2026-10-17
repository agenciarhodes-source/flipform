from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_owners_and_admins_delete_one_template_after_confirming():
    route = read("app/api/integrations/whatsapp/templates/route.ts")
    assert "export const DELETE = withPermission('INTEGRATIONS_MANAGE'" in route
    assert "INTEGRATIONS_MANAGE: ['owner', 'admin']," in read("lib/rbac.ts")
    assert "action: 'WHATSAPP_TEMPLATE_DELETED'," in route
    lib = read("lib/meta/whatsapp-templates.ts")
    assert "hsm_id: input.id," in lib  # only that template and language, never every language of the name
    card = read("app/(app)/integrations/whatsapp-templates-card.tsx")
    assert "window.confirm(" in card
    assert "30 dias" in card
