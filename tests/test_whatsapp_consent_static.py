from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_forms_offer_a_whatsapp_consent_box_the_person_must_tick():
    assert "{ v: 'whatsapp_consent', l: 'Autorização WhatsApp' }," in read("components/form-builder.tsx")
    assert "'whatsapp_consent'," in read("lib/schemas.ts")
    public = read("components/public-typeform.tsx")
    assert "case 'whatsapp_consent': {" in public
    assert "onChange(checked ? null : WHATSAPP_CONSENT_VALUE)" in public
    consent = read("lib/whatsapp-consent.ts")
    assert "pelo WhatsApp" in consent
    assert "value === true || value === WHATSAPP_CONSENT_VALUE ? WHATSAPP_CONSENT_VALUE : null" in consent


def test_the_server_records_only_an_explicit_authorization_and_shows_it():
    submit = read("app/api/public/forms/[slug]/submit/route.ts")
    assert "value: f.fieldType === WHATSAPP_CONSENT_FIELD_TYPE ? normalizeWhatsappConsent(a.value) : a.value," in submit
    # The authorization is validated before the required-field check, so an unticked box is missing.
    assert submit.index("normalizeWhatsappConsent(a.value)") < submit.index("const missingRequired")
    assert "whatsappConsentAt," in read("app/api/leads/[id]/route.ts")
    assert "Autorizou contato em" in read("components/lead-detail-modal.tsx")
    assert "Não há autorização de WhatsApp registrada para este contato." in read("app/(app)/inbox/inbox-client.tsx")
