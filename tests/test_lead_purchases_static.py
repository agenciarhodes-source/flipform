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
    assert 'leadPurchases        LeadPurchase[]' in schema
    assert 'tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)' in schema

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


def test_lead_purchases_migration_matches_production_table_contract():
    migration = read('prisma/migrations/20260704120000_add_lead_purchases/migration.sql')
    assert 'CREATE TABLE IF NOT EXISTS public.lead_purchases' in migration
    for column in ['tenant_id TEXT NOT NULL', 'lead_id TEXT NOT NULL', 'amount_cents INTEGER NOT NULL', "currency TEXT NOT NULL DEFAULT 'BRL'", 'purchase_date TIMESTAMP(3) NOT NULL']:
        assert column in migration
    assert 'CONSTRAINT lead_purchases_tenant_id_fkey' in migration
    assert 'REFERENCES public.tenants(id) ON DELETE CASCADE' in migration
    assert 'CONSTRAINT lead_purchases_lead_id_fkey' in migration
    assert 'REFERENCES public.leads(id) ON DELETE CASCADE' in migration
    for index_name in ['lead_purchases_tenant_id_idx', 'lead_purchases_lead_id_idx', 'lead_purchases_tenant_purchase_date_idx', 'lead_purchases_tenant_lead_purchase_date_idx']:
        assert f'CREATE INDEX IF NOT EXISTS {index_name}' in migration

def test_repair_production_schema_is_idempotent_for_lead_purchases():
    repair = read('scripts/repair-production-schema.ts')
    assert 'CREATE TABLE IF NOT EXISTS public.lead_purchases' in repair
    for column in ['ADD COLUMN IF NOT EXISTS tenant_id TEXT', 'ADD COLUMN IF NOT EXISTS lead_id TEXT', 'ADD COLUMN IF NOT EXISTS amount_cents INTEGER', 'ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP(3)']:
        assert column in repair
    assert 'lead_purchases_tenant_id_fkey' in repair
    assert 'lead_purchases_lead_id_fkey' in repair
    assert 'CREATE INDEX IF NOT EXISTS lead_purchases_tenant_id_idx' in repair
    assert 'CREATE INDEX IF NOT EXISTS lead_purchases_tenant_lead_purchase_date_idx' in repair

def test_admin_readiness_reports_clear_lead_purchases_message():
    readiness = read('lib/admin/assert-admin-schema-ready.ts')
    assert "'lead_purchases'" in readiness
    for column in ['id', 'tenant_id', 'lead_id', 'amount_cents', 'currency', 'purchase_date', 'order_number', 'payment_method', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at']:
        assert column in readiness
    assert 'lead_purchases ausente ou incompleta. Rode migration ou repair-production-schema.' in readiness

def test_dashboard_financial_metrics_handle_missing_lead_purchases_table():
    metrics = read('lib/dashboard-metrics.ts')
    assert 'isLeadPurchasesMissingError' in metrics
    assert 'lead_purchases table missing' in metrics
    assert 'return emptyFinancialWindowMetrics();' in metrics
    assert 'purchases: { none: {} }' in metrics

def test_repair_production_schema_npm_alias_is_documented():
    package = read('package.json')
    docs = read('docs/operations/lead-purchases.md')
    assert '"repair:production-schema": "tsx scripts/repair-production-schema.ts"' in package
    assert 'npm run repair:production-schema' in docs
    assert '20260704120000_add_lead_purchases' in docs
