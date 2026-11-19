"""PR00 A2-C.14: audit evidence only. Green test does NOT clear security findings."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRANCH = 'security/pr00-a2c14-l1-writer-audit-20261117'

def text(path):
    return (ROOT / path).read_text(encoding='utf-8')

def test_audit_documents_actual_unresolved_public_form_slug_issue():
    schema = text('prisma/schema.prisma')
    page = text('app/f/[slug]/page.tsx')
    submit = text('app/api/public/forms/[slug]/submit/route.ts')
    migration = text('prisma/migrations/20260617120000_tenant_scoped_form_slugs_and_domain_readiness/migration.sql')
    assert '@@unique([tenantId, slug])' in schema
    assert 'ON public.forms (tenant_id, slug)' in migration
    assert 'where: { slug: params.slug, isActive: true }' in page
    assert '...(customDomain ? { tenantId: customDomain.tenantId } : {})' in submit
    assert 'NÃO HOMOLOGADO PARA PRODUÇÃO' in text('docs/security/pr00-a2c14-l1-write-path-audit.md')

def test_audit_records_known_unresolved_concurrency_read_before_write():
    move = text('lib/leads/move-stage.ts')
    manual = text('app/api/leads/[id]/move/route.ts')
    assistant = text('lib/lead-assistant/service.ts')
    assert 'prisma.lead.update({ where: { id: lead.id }' in move
    assert 'where: { id: lead.id },' in manual
    assert 'await tx.lead.updateMany({' in assistant
    note = text('docs/security/pr00-a2c14-l1-write-path-audit.md')
    assert 'TOCTOU' in note and 'CAS' in note

def test_preview_disabled_and_risks_not_claimed_fixed():
    config = json.loads(text('vercel.json'))
    assert config['git']['deploymentEnabled'][BRANCH] is False
    assert config['git']['deploymentEnabled']['audit/pr00-a2s-isolation'] is False
    csv = text('docs/security/pr00-a2c14-l1-writer-risk-register.csv')
    assert 'A2C14-01' in csv and 'A2C14-12' in csv
    assert 'P0' in csv and 'P1' in csv
    assert 'PR 01 continua bloqueado' in text('docs/security/pr00-a2c14-l1-write-path-audit.md')
