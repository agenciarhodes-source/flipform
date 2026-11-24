from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
MIGRATION = (ROOT / "prisma/migrations/20261124213000_flip_voice_whatsapp_caller/migration.sql").read_text(encoding="utf-8")

def test_whatsapp_additive_migration_never_enables_calls():
    for column in ('"whatsapp_inbound_enabled"', '"whatsapp_outbound_enabled"'):
        assert column in MIGRATION
        assert f'{column} BOOLEAN NOT NULL DEFAULT false' in MIGRATION
    for field in ("whatsappInboundEnabled","whatsappOutboundEnabled"):
        assert "@default(false)" in next(row for row in SCHEMA.splitlines() if field in row)
    assert '"whatsapp_routing_mode" TEXT NOT NULL DEFAULT \'none\'' in MIGRATION

def test_whatsapp_consent_is_provider_bound_not_pstn_reused():
    for column in ("provider_permission_source","provider_permission_ref",
        "provider_permission_request_sid","provider_permission_confirmed_at",
        "outbound_call_window_start","outbound_calls_in_window",
        "outbound_webhook_ticket_hash","outbound_twiml_claimed_at"):
        assert column in MIGRATION
    assert 'CHECK ("outbound_calls_in_window" >= 0)' in MIGRATION

def test_migration_is_additive_and_never_changes_existing_data():
    for token in ("DROP TABLE","TRUNCATE", "DELETE FROM", "INSERT INTO",
                  "CREATE TRIGGER", "TWILIO_AUTH_TOKEN", "ELEVENLABS_API_KEY",
                  "FLIPFORM_API_V1_ENABLED"):
        assert token not in MIGRATION

def test_outbound_callback_ticket_is_unique_and_never_plaintext():
    assert 'CREATE UNIQUE INDEX "flip_voice_calls_outbound_webhook_ticket_hash_key"' in MIGRATION
    assert 'outboundWebhookTicketHash String? @unique' in SCHEMA
    assert 'outboundTwiMLClaimedAt DateTime?' in SCHEMA
    assert '"outbound_webhook_ticket" TEXT' not in MIGRATION
