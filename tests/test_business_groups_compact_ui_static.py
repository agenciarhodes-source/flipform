from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_business_groups_default_view_is_compact_and_group_focused():
    page = read('app/admin/(secure)/groups/page.tsx')

    assert "const [showCreate, setShowCreate] = useState(false)" in page
    assert "const [managingGroupId, setManagingGroupId] = useState<string | null>(null)" in page
    assert 'Grupos criados' in page
    assert 'Novo grupo' in page
    assert "{isManaging ? 'Fechar' : 'Gerenciar'}" in page
    assert '{isManaging && (' in page


def test_new_group_becomes_visible_then_opens_only_its_configuration():
    page = read('app/admin/(secure)/groups/page.tsx')

    assert 'const createdGroupId = data.group?.id || null' in page
    assert 'setShowCreate(false)' in page
    assert 'if (createdGroupId) setManagingGroupId(createdGroupId)' in page
    assert 'Grupo criado. Agora selecione as empresas e o acesso responsável.' in page


def test_company_and_access_lists_are_hidden_until_group_is_managed():
    page = read('app/admin/(secure)/groups/page.tsx')

    manage_gate = page.index('{isManaging && (')
    company_list = page.index('filteredTenants.map', manage_gate)
    access_list = page.index('availableAccesses.map', manage_gate)

    assert manage_gate < company_list
    assert manage_gate < access_list
    assert 'Os acessos cadastrados só aparecem enquanto este grupo está sendo gerenciado.' in page
    assert 'max-h-[340px] overflow-y-auto' in page
    assert 'Buscar empresa por nome ou slug' in page


def test_compact_ui_does_not_change_business_group_api_or_operational_data():
    page = read('app/admin/(secure)/groups/page.tsx')

    assert "fetch('/api/admin/business-groups'" in page
    assert 'method: \'POST\'' in page
    assert 'method: \'PATCH\'' in page
    assert 'method: \'DELETE\'' in page

    for forbidden in [
        'prisma.lead',
        'prisma.form',
        'prisma.pipeline',
        'tenantMetaConnection',
        'whatsapp',
        'facebook',
        'google',
    ]:
        assert forbidden not in page.lower()
