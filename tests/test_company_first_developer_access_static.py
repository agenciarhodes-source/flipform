"""The company is chosen in the second authorization step, not at account registration."""
from pathlib import Path
PAGE=Path('app/admin/(secure)/developer-access/page.tsx').read_text(encoding='utf-8')
API=Path('app/api/admin/developer-access/route.ts').read_text(encoding='utf-8')

def test_company_selected_when_authorizing_registered_developer():
    assert '1. Criar conta de Desenvolvedor' in PAGE
    assert '2. Autorizar Desenvolvedor em uma empresa' in PAGE
    section=PAGE.split('2. Autorizar Desenvolvedor em uma empresa',1)[1]
    assert section.index('Empresa\n') < section.index('Desenvolvedor a autorizar')
    assert 'Autorizar Desenvolvedor nesta empresa' in section

def test_catalog_failure_is_visible():
    assert 'Empresas e usuários não carregaram' in PAGE
    assert 'catalogError' in PAGE
    assert 'Tentar novamente' in PAGE

def test_catalog_read_mfa_does_not_weaken_write_mfa():
    assert 'now - verifiedAt > 7 * 24 * 60 * 60' in API
    assert 'if (!originValid(req) || !hasRecentMfa(session))' in API
    assert 'const denied = await preflight(req, session)' in API

def test_catalog_only_registered_developers_and_legacy_grantees():
    assert 'export const GET = withPlatformAdmin(' in API
    assert "globalRole: 'developer_account'" in API
    assert 'developerGrants: { some: {} }' in API
