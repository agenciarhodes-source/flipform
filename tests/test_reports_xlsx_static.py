from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "app/api/reports/export/route.ts").read_text()
UI = (ROOT / "components/reports-page-client.tsx").read_text()
DOC = (ROOT / "docs/operations/reports-xlsx-export.md").read_text()

def test_export_endpoint_defaults_to_xlsx_and_node_runtime():
    assert "export const runtime = 'nodejs'" in ROUTE
    assert "format = (searchParams.get('format') || 'xlsx')" in ROUTE
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in ROUTE
    assert "Buffer.from(buffer)" in ROUTE
    assert 'filename="${filename}"' in ROUTE

def test_workbook_contains_required_sheets_and_headers():
    for sheet in ["Resumo", "Leads", "Compras"]:
        assert f"addWorksheet('{sheet}')" in ROUTE
    for header in ["ID do lead", "Nome do cliente", "Estado", "Cidade", "Vendedor responsável", "Formulário", "Data de entrada", "Data de fechamento", "Valor total vendido", "Tipo de cliente"]:
        assert header in ROUTE
    for header in ["Data da compra", "Número do pedido", "Forma de pagamento", "Tipo da compra"]:
        assert header in ROUTE

def test_business_rules_are_encoded():
    assert "getLeadRevenueSource(l).amountCents" in ROUTE
    assert "Cliente recorrente" in ROUTE
    assert "saleValueUpdatedAt || lead.updatedAt" in ROUTE
    assert "extractLeadLocation" in ROUTE
    assert "withPermission('REPORTS_EXPORT'" in ROUTE
    assert "validateFiltersBelongToTenant(ctx)" in ROUTE
    assert "PURCHASE_EXPORT_LIMIT = 50000" in ROUTE
    assert "EXPORT_HARD_LIMIT = 10000" in ROUTE

def test_frontend_button_uses_excel_copy_and_format():
    assert "downloadExcel" in UI
    assert "Exportar Excel" in UI
    assert "FileSpreadsheet" in UI
    assert "format=xlsx" in UI
    assert "Excel exportado com sucesso." in UI
    assert "Não foi possível exportar o relatório em Excel." in UI
    assert "flipform-relatorio.xlsx" in UI

def test_documentation_exists():
    for text in ["Quem pode exportar", "Filtros aplicados", "Abas geradas", "Regras de data de fechamento", "Regra de receita", "Limites", "Atendente/Vendedor"]:
        assert text in DOC
