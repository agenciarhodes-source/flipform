from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_qualified_redirect_reuses_existing_form_settings_without_migration():
    schema = read('lib/schemas.ts')
    builder = read('components/form-builder.tsx')
    public = read('components/public-typeform.tsx')
    prisma = read('prisma/schema.prisma')

    assert 'qualifiedRedirectUrl:' in schema
    assert 'Use uma URL iniciando com http:// ou https://.' in schema
    assert "const [qualifiedRedirectUrl, setQualifiedRedirectUrl] = useState('');" in builder
    assert "f.disqualificationSettings?.qualifiedRedirectUrl || ''" in builder
    assert 'qualifiedRedirectUrl: qualifiedRedirectUrl || null' in builder
    assert 'Redirecionamento para lead qualificado' in builder
    assert 'form.disqualificationSettings?.qualifiedRedirectUrl || null' in public
    assert 'window.location.href = qualifiedRedirectUrl' in public
    assert 'if (!previewMode)' in public
    assert 'qualifiedRedirectUrl' not in prisma


def test_qualified_redirect_keeps_existing_unqualified_redirect_behavior():
    builder = read('components/form-builder.tsx')
    public = read('components/public-typeform.tsx')

    assert 'redirectUrl: dqRedirectUrl || null' in builder
    assert 'window.location.href = redirectUrl' in public
    assert "settings.buttonText || 'Entendi'" in public
