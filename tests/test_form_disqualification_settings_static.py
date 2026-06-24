from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_prisma_schema_and_migration_add_nullable_disqualification_settings_column():
    schema = read('prisma/schema.prisma')
    migration = read('prisma/migrations/20260624120000_add_form_disqualification_settings/migration.sql')

    assert 'disqualificationSettings Json?' in schema
    assert '@map("disqualification_settings")' in schema
    assert 'ALTER TABLE public.forms' in migration
    assert 'ADD COLUMN IF NOT EXISTS disqualification_settings JSONB' in migration
    assert 'NOT NULL' not in migration.upper()
    assert 'DEFAULT' not in migration.upper()


def test_repair_and_readiness_cover_disqualification_settings_with_clear_message():
    repair = read('scripts/repair-production-schema.ts')
    readiness = read('lib/admin/assert-admin-schema-ready.ts')

    assert 'forms.disqualification_settings' in repair
    assert 'ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS disqualification_settings JSONB' in repair
    assert "'disqualification_settings'" in readiness
    assert 'forms.disqualification_settings ausente. Rode repair schema ou migration.' in readiness


def test_forms_api_accepts_null_and_saves_configured_disqualification_settings():
    create_route = read('app/api/forms/route.ts')
    update_route = read('app/api/forms/[id]/route.ts')

    for route in (create_route, update_route):
        assert 'disqualificationSettings: data.disqualificationSettings == null ? Prisma.JsonNull : (data.disqualificationSettings as Prisma.InputJsonValue)' in route
        assert 'formCreateSchema.safeParse(body)' in route

    assert 'include: {' in create_route
    assert '_count: { select: { leads: true, fields: true } }' in create_route
