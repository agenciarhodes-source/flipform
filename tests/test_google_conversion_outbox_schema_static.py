import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = 'prisma/migrations/20261007190000_google_conversion_outbox/migration.sql'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def sql_statements() -> str:
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith('--')]
    return '\n'.join(lines).upper()


def test_migration_is_additive_and_only_creates_the_two_new_tables():
    sql = sql_statements()
    for forbidden in ['DROP ', 'TRUNCATE', 'DELETE FROM', 'UPDATE "', 'ALTER TABLE', 'INSERT ', 'RENAME ']:
        assert forbidden not in sql, forbidden
    created = re.findall(r'CREATE TABLE "([A-Z_]+)"', sql)
    assert created == ['GOOGLE_CONVERSION_MAPPINGS', 'GOOGLE_CONVERSION_EVENTS']
    indexed = set(re.findall(r'\bON "([A-Z_]+)"\(', sql))
    assert indexed == {'GOOGLE_CONVERSION_MAPPINGS', 'GOOGLE_CONVERSION_EVENTS'}


def test_migration_enforces_tenant_isolation_and_idempotency():
    migration = read(MIGRATION)
    assert 'FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE' in migration
    assert 'FOREIGN KEY ("tenant_id", "mapping_id")' in migration
    assert 'REFERENCES "google_conversion_mappings"("tenant_id", "id") ON DELETE NO ACTION' in migration
    assert 'ON "google_conversion_events"("tenant_id", "idempotency_key")' in migration
    assert 'ON "google_conversion_mappings"("tenant_id", "stage_id", "conversion_action_resource")' in migration
    assert '"enabled" BOOLEAN NOT NULL DEFAULT false' in migration
    assert '"optimization_role" TEXT NOT NULL DEFAULT \'secondary\'' in migration


def test_migration_checks_match_the_funnel_contract():
    migration = read(MIGRATION)
    contract = read('lib/tracking/google-funnel.ts')
    assert "['lead', 'qualified_lead', 'converted_lead']" in contract
    assert "('lead', 'qualified_lead', 'converted_lead')" in migration
    assert "['primary', 'secondary']" in contract
    assert "('primary', 'secondary')" in migration
    assert "['none', 'fixed', 'purchase']" in contract
    assert "('none', 'fixed', 'purchase')" in migration
    assert "['PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY', 'FAILED']" in contract
    assert "('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY', 'FAILED')" in migration


def test_prisma_models_map_to_the_migration_tables():
    schema = read('prisma/schema.prisma')
    assert 'model GoogleConversionMapping {' in schema
    assert 'model GoogleConversionEvent {' in schema
    assert '@@map("google_conversion_mappings")' in schema
    assert '@@map("google_conversion_events")' in schema
    assert '@@unique([tenantId, idempotencyKey])' in schema
    assert '@@unique([tenantId, stageId, conversionActionResource])' in schema
    assert 'references: [tenantId, id], onDelete: NoAction' in schema
    assert 'googleConversionMappings GoogleConversionMapping[]' in schema
    assert 'googleConversionEvents GoogleConversionEvent[]' in schema


def test_existing_attribution_and_tracking_tables_are_untouched():
    schema = read('prisma/schema.prisma')
    attribution = schema.split('model LeadAttribution {')[1].split('}')[0]
    assert 'gbraid' not in attribution
    assert 'wbraid' not in attribution
    assert 'lead_attributions' not in read(MIGRATION)
    assert 'kanban_stage_tracking_events' not in read(MIGRATION)


def test_only_the_mapping_module_touches_the_new_tables():
    allowed = ROOT / 'lib' / 'tracking' / 'google-funnel-mappings.ts'
    for folder in ['app', 'lib']:
        for path in (ROOT / folder).rglob('*.ts*'):
            source = path.read_text(encoding='utf-8')
            # The event outbox has no writer or reader yet.
            assert not re.search(r'\.googleConversionEvent\b', source), path
            if path != allowed:
                assert not re.search(r'\.googleConversionMapping\b', source), path
