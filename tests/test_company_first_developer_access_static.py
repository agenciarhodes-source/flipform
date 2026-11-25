"""Developer access admin: company-first UX and readable catalog with MFA safety."""
from pathlib import Path

PAGE = Path('app/admin/(secure)/developer-access/page.tsx').read_text(encoding='utf-8')
API = Path('app/api/admin/developer-access/route.ts').read_text(encoding='utf-8')


def test_admin_uses_company_first_developer_authorization():
    assert 'Adicionar Desenvolvedor à empresa' in PAGE
    section = PAGE.split('Adicionar Desenvolvedor à empresa', 1)[1]
    assert section.index('Empresa\n') < section.index('Desenvolvedor a autorizar')
    assert 'Autorizar Desenvolvedor nesta empresa' in section
    assert 'Adicionar empresa a um Desenvolvedor' not in PAGE


def test_admin_explains_catalog_failure_instead_of_silent_empty_dropdown():
    assert 'Empresas e usuários não carregaram' in PAGE
    assert 'catalogError' in PAGE
    assert 'Tentar novamente' in PAGE
    assert 'Nenhuma empresa ativa disponível' in PAGE


def test_catalog_read_mfa_window_does_not_weaken_write_mfa():
    assert 'now - verifiedAt > 7 * 24 * 60 * 60' in API
    assert "if (!hasRecentMfa(session))" not in API.split('export const GET =', 1)[1]
    assert 'now - session.mfaVerifiedAt > 15 * 60' not in API  # uses shared helper
    assert 'if (!originValid(req) || !hasRecentMfa(session))' in API
    assert 'const denied = await preflight(req, session)' in API


def test_catalog_still_only_reads_from_platform_admin_and_excludes_other_super_admins():
    assert 'export const GET = withPlatformAdmin(' in API
    assert "globalRole: null" in API
    assert "globalRole: { not: 'platform_admin' }" in API
