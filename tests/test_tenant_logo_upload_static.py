from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PICKER = ROOT / 'components/settings/company-logo-picker.tsx'
SETTINGS = ROOT / 'components/settings-page-client.tsx'
VALIDATION = ROOT / 'lib/tenant-logo.ts'
SCHEMA = ROOT / 'lib/schemas-tenant.ts'
SETTINGS_ROUTE = ROOT / 'app/api/settings/tenant/route.ts'


def read(path: Path) -> str:
    return path.read_text()


def test_company_logo_picker_supports_click_and_drag_drop():
    source = read(PICKER)
    assert 'Arraste a logo até aqui' in source
    assert 'clique para escolher uma imagem do seu dispositivo' in source
    assert 'onDrop={handleDrop}' in source
    assert 'type="file"' in source


def test_company_logo_picker_limits_files_to_120kb():
    picker = read(PICKER)
    validation = read(VALIDATION)
    assert 'TENANT_LOGO_MAX_BYTES = 120 * 1024' in validation
    assert 'file.size > TENANT_LOGO_MAX_BYTES' in picker
    assert 'A logo deve ter no máximo 120 KB.' in picker


def test_company_logo_picker_accepts_only_safe_raster_formats():
    picker = read(PICKER)
    validation = read(VALIDATION)
    assert "'image/png'" in validation
    assert "'image/jpeg'" in validation
    assert "'image/webp'" in validation
    assert 'image/svg+xml' not in validation
    assert 'accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"' in picker


def test_tenant_schema_validates_uploaded_logo_server_side():
    schema = read(SCHEMA)
    assert "import { isValidTenantLogoValue } from './tenant-logo';" in schema
    assert 'isValidTenantLogoValue' in schema
    assert 'PNG, JPG ou WebP de até 120 KB' in schema


def test_settings_page_uses_company_logo_picker_instead_of_url_input():
    source = read(SETTINGS)
    assert "import { CompanyLogoPicker } from '@/components/settings/company-logo-picker';" in source
    assert '<CompanyLogoPicker value={logoUrl} onChange={setLogoUrl} disabled={!canEdit} />' in source
    assert 'Logo (URL)' not in source


def test_existing_http_logo_urls_remain_backward_compatible():
    validation = read(VALIDATION)
    assert "url.protocol === 'http:' || url.protocol === 'https:'" in validation


def test_logo_data_is_not_duplicated_into_audit_metadata():
    route = read(SETTINGS_ROUTE)
    assert "from: current.logoUrl ? '[configured]' : null" in route
    assert "to: normalized ? '[configured]' : null" in route
    assert 'changes.logoUrl = { from: current.logoUrl, to: normalized }' not in route
