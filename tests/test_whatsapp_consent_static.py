from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_the_form_shows_the_notice_and_sending_it_records_the_authorization():
    notice = read("lib/whatsapp-consent.ts")
    assert "pelo WhatsApp" in notice and "não são compartilhados com terceiros" in notice
    public = read("components/public-typeform.tsx")
    assert "{contactConsentNotice(form.tenantName)}" in public
    submit = read("app/api/public/forms/[slug]/submit/route.ts")
    assert "action: CONTACT_CONSENT_ACTION," in submit
    assert "notice: contactConsentNotice(form.tenant.name)," in submit
    # No extra field: the authorization does not depend on a box the person might miss.
    assert "whatsapp_consent" not in read("lib/schemas.ts")


def test_the_lead_and_the_inbox_show_whether_the_authorization_was_recorded():
    assert "action: 'lead.contact_consent_recorded' }," in read("app/api/leads/[id]/route.ts")
    assert "Autorizou contato em" in read("components/lead-detail-modal.tsx")
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "Este lead autorizou contato pelo WhatsApp ao enviar o formulário." in inbox
    assert "CONTACT_CONSENT_ACTION = 'lead.contact_consent_recorded'" in read("lib/whatsapp-consent.ts")
