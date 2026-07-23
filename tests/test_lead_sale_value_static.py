from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_lead_sale_value_schema_migration_and_repair_are_present():
    schema = (ROOT / "prisma/schema.prisma").read_text()
    migration = (ROOT / "prisma/migrations/20260625120000_add_lead_sale_value/migration.sql").read_text()
    repair = (ROOT / "scripts/repair-production-schema.ts").read_text()
    assert 'saleValueCents Int?          @map("sale_value_cents")' in schema
    assert 'saleCurrency String          @default("BRL") @map("sale_currency")' in schema
    assert 'saleValueUpdatedAt DateTime? @map("sale_value_updated_at")' in schema
    assert 'saleValueUpdatedBy String?   @map("sale_value_updated_by")' in schema
    assert 'ADD COLUMN IF NOT EXISTS sale_value_cents INTEGER' in migration
    assert "ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'BRL'" in migration
    assert 'ADD COLUMN IF NOT EXISTS sale_value_updated_at TIMESTAMP(3)' in migration
    assert 'ADD COLUMN IF NOT EXISTS sale_value_updated_by TEXT' in migration
    assert 'leads.sale_value_cents' in repair
    assert "ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'BRL'" in repair
    assert 'ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_value_updated_at TIMESTAMP(3)' in repair
    assert 'ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_value_updated_by TEXT' in repair


def test_lead_sale_value_readiness_checks_are_present():
    readiness = (ROOT / "lib/admin/assert-admin-schema-ready.ts").read_text()
    assert "'leads'" in readiness
    assert "'sale_value_cents'" in readiness
    assert "'sale_currency'" in readiness
    assert "'sale_value_updated_at'" in readiness
    assert "'sale_value_updated_by'" in readiness
    assert 'leads.sale_value_cents ausente. Rode migration ou repair schema.' in readiness


def test_dashboard_does_not_use_legacy_sale_values_as_revenue():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "fallbackRevenueCents" not in metrics
    assert "const revenueByDayMap = new Map(byDayMap);" not in metrics
    assert "const revenueByDayMap = new Map<string, number>();" in metrics

def test_brl_helpers_support_format_parse_and_negative_validation():
    helper = (ROOT / "lib/currency-brl.ts").read_text()
    assert 'formatCurrencyBRLFromCents' in helper
    assert 'parseBRLToCents' in helper
    assert "currency: 'BRL'" in helper
    assert "raw.includes('-')" in helper
    assert 'Math.round(decimalValue * 100)' in helper


def test_legacy_sale_value_endpoint_creates_an_explicit_purchase_with_rbac():
    route = (ROOT / "app/api/leads/[id]/sale-value/route.ts").read_text()
    assert 'withAuth' in route
    assert 'tenantId: session.tenantId' in route
    assert 'canEditLead(session.role, lead, session.userId)' in route
    assert 'prisma.leadPurchase.create' in route
    assert 'createdBy: session.userId' in route
    assert "action: 'lead.purchase_created'" in route

def test_lead_detail_registers_sales_in_the_financial_tab():
    modal = (ROOT / "components/lead-detail-modal.tsx").read_text()
    assert '+ Adicionar compra' in modal
    assert 'Registrar venda' in modal
    assert '/purchases' in modal
    assert '/sale-value' not in modal
