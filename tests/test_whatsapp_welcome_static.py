from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_welcome_is_additive_and_off_by_default():
    sql = read("prisma/migrations/20261030120000_whatsapp_welcome/migration.sql")
    assert "CREATE TABLE IF NOT EXISTS \"whatsapp_welcome_settings\"" in sql
    assert "\"enabled\" BOOLEAN NOT NULL DEFAULT false" in sql
    assert "CONSTRAINT \"whatsapp_welcome_sends_lead_id_key\" UNIQUE (\"lead_id\")" in sql
    assert "DROP " not in sql and "ALTER TABLE" not in sql


def test_the_scheduler_sends_once_and_only_when_the_person_did_not_write():
    job = read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "const welcome = await sweepWhatsAppWelcomes()" in job
    welcome = read("lib/whatsapp-ai/welcome.ts")
    assert "if (customerAlreadyWrote(current?.lastInboundAt, now))" in welcome
    assert "idempotencyKey: `whatsapp-welcome-${lead.id}`" in welcome
    assert "action: CONSENT_ACTION" in welcome


def test_first_name_in_templates_and_no_repeated_registration_note():
    values = read("lib/meta/whatsapp-template-values.ts")
    assert "const name = registrationFirstName(fullName) || fullName || 'cliente';" in values
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "registrationNote: registration?.fromForm && recentOutbound.length === 0" in reply
    page = read("app/(app)/whatsapp-ai/page.tsx")
    assert "<WelcomeManager />" in page


def test_the_wait_is_in_seconds():
    sql = read("prisma/migrations/20261031120000_whatsapp_welcome_delay_seconds/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "delay_seconds" INTEGER;' in sql
    welcome = read("lib/whatsapp-ai/welcome.ts")
    assert "delaySeconds: welcomeDelaySeconds(settings)" in welcome
    manager = read("components/whatsapp-ai/welcome-manager.tsx")
    assert "segundos ({waitLabel(settings.delaySeconds)})" in manager
