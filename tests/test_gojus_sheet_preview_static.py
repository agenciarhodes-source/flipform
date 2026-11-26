from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path): return (ROOT/path).read_text(encoding="utf-8")
def test_sheet_preview_is_gated_and_cpf_is_only_revealed_by_existing_route():
    route=read("app/api/leads/[id]/gojus-sheet/route.ts")
    assert "tenantHasFeature(session.tenantId,'gojus_sheet')" in route
    assert "getLeadScopeForRole(session)" in route and "canEditLead(session.role,lead,session.userId)" in route
    assert "tenantId:session.tenantId,leadId:lead.id" in route
    assert "cpfMasked:cpf.masked" in route and "revealLeadCpf" not in route
    assert "ready:false" in route and "private, no-store" in route
    ui=read("components/gojus-sheet-preview.tsx")
    assert "/cpf?reveal=1" in ui and "Preparar ficha GoJus" in ui
    assert "gojusSheet&&<GoJusSheetPreview" in read("components/lead-documents-tab.tsx")
    assert "gojus_sheet" in read("app/api/leads/[id]/documents/route.ts")
