from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text()

def test_prisma_lead_purchase_model_and_indexes():
    schema = read('prisma/schema.prisma')
    assert 'model LeadPurchase' in schema
    assert '@@map("lead_purchases")' in schema
    assert '@@index([tenantId, purchaseDate])' in schema
    assert 'purchases    LeadPurchase[]' in schema

def test_purchase_api_validates_tenant_and_amount():
    route = read('app/api/leads/[id]/purchases/route.ts')
    assert 'tenantId: session.tenantId' in route
    assert 'leadPurchaseSchema.safeParse' in route
    assert 'canEditLead' in route
    assert 'Compra registrada com sucesso.' in route

def test_dashboard_financial_metrics_use_purchases_and_fallback():
    metrics = read('lib/dashboard-metrics.ts')
    assert 'leadPurchase.findMany' in metrics
    assert 'purchaseDate: { gte: params.startDate, lte: params.endDate }' in metrics
    assert 'purchases: { none: {} }' in metrics
    assert 'firstPurchaseRevenue' in metrics
    assert 'repurchaseRate' in metrics

def test_currency_helpers_parse_and_format_brl():
    helper = read('lib/currency-brl.ts')
    assert 'formatBRLFromCents' in helper
    assert 'parseBRLToCents' in helper
    assert "Intl.NumberFormat('pt-BR'" in helper
