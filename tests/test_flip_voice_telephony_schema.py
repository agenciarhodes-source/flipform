from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
SQL = (ROOT / "prisma/migrations/20261124180000_flip_voice_telephony/migration.sql").read_text(encoding="utf-8")

def test_pstn_schema_adds_exact_approved_tenant_tables():
    for name in ("flip_voice_lines", "flip_voice_contact_permissions"):
        assert f'@@map("{name}")' in SCHEMA
        assert f'CREATE TABLE "{name}"' in SQL
        assert f'"{name}_tenant_id_fkey"' in SQL
    assert 'REFERENCES "flip_voice_profiles"("tenant_id","id")' in SQL
    assert 'REFERENCES "flip_voice_lines"("tenant_id","id")' in SQL
    assert 'REFERENCES "flip_voice_contact_permissions"("tenant_id","id")' in SQL

def test_incoming_and_outgoing_are_disabled_by_default():
    for col in ('"inbound_enabled"', '"outbound_enabled"'):
        assert f'{col} BOOLEAN NOT NULL DEFAULT false' in SQL
    assert '"status" TEXT NOT NULL DEFAULT \'disabled\'' in SQL
    assert 'contact_permission_id' in SQL
    assert 'evidence_sha256' in SQL

def test_schema_does_not_run_campaigns_or_mutate_existing_data():
    for keyword in ("DROP TABLE", "TRUNCATE", "DELETE FROM", "UPDATE \"", "INSERT INTO",
                    "TWILIO_AUTH_TOKEN", "ELEVENLABS_API_KEY", "OPENAI_API_KEY",
                    "flip_voice_calls SET"):
        assert keyword not in SQL
