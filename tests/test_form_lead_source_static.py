from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_schema_and_migration_define_form_lead_source():
    schema = text('prisma/schema.prisma')
    migration = text('prisma/migrations/20260717160000_add_form_lead_source/migration.sql')
    assert 'leadSource        String   @default("formulario") @map("lead_source")' in schema
    assert '@@index([tenantId, leadSource])' in schema
    assert '@@index([tenantId, source])' in schema
    assert 'ADD COLUMN IF NOT EXISTS lead_source TEXT' in migration
    assert "SET lead_source = 'formulario'" in migration
    assert 'ALTER COLUMN lead_source\nSET NOT NULL' in migration
    assert 'forms_tenant_id_lead_source_idx' in migration
    assert 'leads_tenant_id_source_idx' in migration


def test_public_submission_uses_persisted_form_source_only():
    route = text('app/api/public/forms/[slug]/submit/route.ts')
    assert "const leadSource = form.leadSource?.trim() || 'formulario';" in route
    assert 'source: leadSource,' in route
    assert "metadata: { leadId: lead.id, source: 'public_form', leadSource, slug }" in route
    assert "source: 'public_form'," in route  # tracking remains technical


def test_editor_and_labels_support_form_sources():
    leads = text('lib/leads.ts')
    builder = text('components/form-builder.tsx')
    page = text('app/(app)/forms/page.tsx')
    assert 'FORM_LEAD_SOURCES' in leads
    for value in ('facebook_ads', 'instagram_direct', 'google_business_profile'):
        assert value in leads
    assert 'setLeadSource(f.leadSource || \'formulario\')' in builder
    assert 'leadSource,' in builder
    assert 'Origem automática do lead' in builder
    assert "formatLeadSource(f.leadSource || 'formulario')" in page
