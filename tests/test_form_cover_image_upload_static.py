from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_form_cover_upload_has_expected_dimensions_size_and_types():
    helper = read('lib/form-cover-image.ts')
    picker = read('components/form-builder/form-cover-image-picker.tsx')

    assert 'FORM_COVER_IMAGE_MAX_BYTES = FORM_LOGO_MAX_BYTES' in helper
    assert 'FORM_COVER_IMAGE_WIDTH = 500' in helper
    assert 'FORM_COVER_IMAGE_HEIGHT = 500' in helper
    assert 'file.size > FORM_COVER_IMAGE_MAX_BYTES' in picker
    assert 'isSupportedFormCoverImageMimeType(file.type)' in picker
    assert 'dimensions.width !== FORM_COVER_IMAGE_WIDTH' in picker
    assert 'dimensions.height !== FORM_COVER_IMAGE_HEIGHT' in picker
    assert 'A imagem de capa deve ter exatamente 500 × 500 px.' in picker
    assert 'A imagem de capa deve ter no máximo 150 KB.' in picker
    assert 'reader.readAsDataURL(file)' in picker


def test_form_builder_replaces_cover_url_only_input_with_upload_picker():
    builder = read('components/form-builder.tsx')
    picker = read('components/form-builder/form-cover-image-picker.tsx')

    assert "import { FormCoverImagePicker } from './form-builder/form-cover-image-picker';" in builder
    assert '<FormCoverImagePicker value={coverImageUrl} onChange={setCoverImageUrl} />' in builder
    assert 'coverImageUrl: coverImageUrl || null' in builder
    assert 'Imagem de capa (URL opcional)' not in builder
    assert 'Escolher imagem de capa do computador' in picker
    assert 'Prévia da imagem de capa do formulário' in picker
    assert "onClick={() => onChange('')}" in picker
    assert 'ou use uma URL' in picker


def test_server_revalidates_cover_data_url_without_schema_migration():
    schema = read('lib/schemas.ts')
    helper = read('lib/form-cover-image.ts')
    prisma = read('prisma/schema.prisma')

    assert "import { isValidFormCoverImageValue } from './form-cover-image';" in schema
    assert "coverImageUrl: z.string().refine(isValidFormCoverImageValue" in schema
    assert "if (!value.startsWith('data:')) return true;" in helper
    assert 'size <= FORM_COVER_IMAGE_MAX_BYTES' in helper
    assert 'coverImageUrl     String?' in prisma
    assert 'FormCoverImage' not in prisma
