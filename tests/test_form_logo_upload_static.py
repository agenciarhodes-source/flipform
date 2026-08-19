from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_form_logo_upload_has_150kb_limit_and_safe_image_types():
    helper = read('lib/form-logo.ts')
    picker = read('components/form-builder/form-logo-picker.tsx')

    assert 'FORM_LOGO_MAX_BYTES = 150 * 1024' in helper
    assert "'image/png'" in helper
    assert "'image/jpeg'" in helper
    assert "'image/webp'" in helper
    assert 'image/svg' not in helper
    assert 'file.size > FORM_LOGO_MAX_BYTES' in picker
    assert 'isSupportedFormLogoMimeType(file.type)' in picker
    assert 'reader.readAsDataURL(file)' in picker
    assert 'A logo deve ter no máximo 150 KB.' in picker


def test_form_builder_exposes_file_upload_preview_remove_and_url_fallback():
    builder = read('components/form-builder.tsx')
    picker = read('components/form-builder/form-logo-picker.tsx')

    assert "import { FormLogoPicker } from './form-builder/form-logo-picker';" in builder
    assert '<FormLogoPicker value={formLogoUrl} onChange={setFormLogoUrl} />' in builder
    assert 'logoUrl: formLogoUrl || null' in builder
    assert 'type="file"' in picker
    assert 'Escolher imagem do computador' in picker
    assert 'Prévia da logo do formulário' in picker
    assert "onClick={() => onChange('')}" in picker
    assert 'ou use uma URL' in picker


def test_server_revalidates_uploaded_logo_without_schema_migration():
    schema = read('lib/schemas.ts')
    helper = read('lib/form-logo.ts')
    prisma = read('prisma/schema.prisma')

    assert "import { isValidFormLogoValue } from './form-logo';" in schema
    assert "logoUrl: z.string().refine(isValidFormLogoValue" in schema
    assert "if (!value.startsWith('data:')) return true;" in helper
    assert 'size <= FORM_LOGO_MAX_BYTES' in helper
    assert 'logoUrl           String?' in prisma
    assert 'FormLogo' not in prisma
