from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_the_contact_phone_is_never_edited():
    route = (ROOT / "app/api/leads/[id]/route.ts").read_text(encoding="utf-8")
    assert "? ['temperature']" in route
    assert ": ['temperature', 'assignedTo', 'lostReason'];" in route
    assert "'phone'" not in route
    assert "parseLeadBasicInfo({ name: body?.name, email: body?.email })" in route
    assert "canEdit: canEditLead(session.role, lead, session.userId)" in route


def test_the_lead_card_edits_name_and_email():
    modal = (ROOT / "components/lead-detail-modal.tsx").read_text(encoding="utf-8")
    assert "Dados básicos" in modal
    assert "JSON.stringify({ name: basicForm.name, email: basicForm.email })" in modal
    assert '<Input id="lead-basic-phone" value={lead.phone || \'Sem telefone\'} disabled readOnly />' in modal
