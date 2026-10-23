from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_manual_lead_accepts_only_a_brazilian_mobile():
    dialog = (ROOT / "components/manual-lead-dialog.tsx").read_text(encoding="utf-8")
    assert "import { formatBrazilPhone, isValidBrazilMobilePhone } from '@/lib/form-field-validation';" in dialog
    assert "formatBrazilPhone(e.target.value)" in dialog
    assert "disabled={saving || !!duplicate || phoneInvalid}" in dialog
    route = (ROOT / "app/api/leads/route.ts").read_text(encoding="utf-8")
    assert "if (phone && !isValidBrazilMobilePhone(phone)) {" in route
    assert "Informe um celular do Brasil: +55 (DDD) 9 0000-0000." in route
