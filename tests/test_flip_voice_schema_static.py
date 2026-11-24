from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
MIGRATION = (ROOT / "prisma/migrations/20261124130000_flip_voice_core/migration.sql").read_text(encoding="utf-8")


def test_flip_voice_tables_are_additive_and_tenant_scoped():
    for name in [
        "flip_voice_settings", "flip_voice_profiles", "flip_voice_consents",
        "flip_voice_calls", "flip_voice_events", "flip_voice_budgets",
    ]:
        assert f'@@map("{name}")' in SCHEMA, name
        assert f'CREATE TABLE "{name}"' in MIGRATION, name
        assert f'"{name}_tenant_id_fkey"' in MIGRATION, name


def test_flip_voice_composite_foreign_keys_prevent_cross_tenant_links():
    assert 'REFERENCES "flip_ai_agents"("tenant_id","id")' in MIGRATION
    assert 'REFERENCES "flip_voice_profiles"("tenant_id","id")' in MIGRATION
    assert 'REFERENCES "flip_voice_consents"("tenant_id","profile_id","id")' in MIGRATION
    assert 'REFERENCES "flip_voice_calls"("tenant_id","id")' in MIGRATION
    assert "UNIQUE INDEX \"flip_voice_calls_tenant_id_channel_direction_request_key_hash_key\"" in MIGRATION


def test_flip_voice_new_tenants_cannot_call_or_record_by_default():
    schema_block = SCHEMA.split("model FlipVoiceSettings {", 1)[1].split("\n}", 1)[0]
    migration_block = MIGRATION.split('CREATE TABLE "flip_voice_settings" (', 1)[1].split("\n);", 1)[0]
    for field in ["enabled", "outboundEnabled", "recordingEnabled"]:
        assert "@default(false)" in next(line for line in schema_block.splitlines() if field in line)
    for db_field in ['"enabled"', '"outbound_enabled"', '"recording_enabled"']:
        assert "DEFAULT false" in next(line for line in migration_block.splitlines() if db_field in line)
    assert '"monthly_limit_micros" BIGINT NOT NULL DEFAULT 0' in MIGRATION
    assert '"per_call_limit_micros" BIGINT NOT NULL DEFAULT 0' in MIGRATION


def test_no_schema_migration_sends_real_calls_or_audio_samples():
    forbidden = [
        "DROP TABLE", "TRUNCATE ", "CREATE TRIGGER", "CREATE FUNCTION",
        "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "TWILIO_AUTH_TOKEN", "audio_sample",
        "raw_phone", "recording_url", "transcript_text",
    ]
    upper_sql = MIGRATION.upper()
    for item in forbidden:
        assert item.upper() not in upper_sql, item
