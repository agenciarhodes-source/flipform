from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_leads_api_returns_form_name_for_list():
    route = read('app/api/leads/route.ts')
    get_block = route.split("export const GET = withPermission('LEADS_VIEW'", 1)[1].split("export const POST", 1)[0]
    assert "form: { select: { id: true, name: true } }" in get_block

def test_leads_list_displays_form_name():
    page = read('app/(app)/leads/page.tsx')
    assert '>Formulário</th>' in page
    assert "l.form?.name || '—'" in page
    assert 'colSpan={9}' in page

def test_form_column_is_read_only_and_does_not_touch_integrations_or_lead_creation():
    page = read('app/(app)/leads/page.tsx')
    route = read('app/api/leads/route.ts')
    get_block = route.split("export const GET = withPermission('LEADS_VIEW'", 1)[1].split("export const POST", 1)[0]
    combined = page + '\n' + get_block
    for forbidden in [
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in combined
