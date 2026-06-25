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


def test_lead_and_dashboard_null_sale_value_fallbacks_are_present():
    leads_route = (ROOT / "app/api/leads/route.ts").read_text()
    sale_value_route = (ROOT / "app/api/leads/[id]/sale-value/route.ts").read_text()
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "prisma.lead.findMany" in leads_route
    assert "saleValueCents: z.number().int().min(0).nullable()" in sale_value_route
    assert "const previousValueCents = lead.saleValueCents ?? null" in sale_value_route
    assert "return result._sum.saleValueCents || 0" in metrics
    assert "saleValueCents: { gt: 0 }" in metrics


def test_brl_helpers_support_format_parse_and_negative_validation():
    helper = (ROOT / "lib/currency-brl.ts").read_text()
    assert 'formatCurrencyBRLFromCents' in helper
    assert 'parseBRLToCents' in helper
    assert "currency: 'BRL'" in helper
    assert "raw.includes('-')" in helper
    assert 'Math.round(decimalValue * 100)' in helper


def test_sale_value_api_enforces_auth_permission_tenant_scope_and_audit():
    route = (ROOT / "app/api/leads/[id]/sale-value/route.ts").read_text()
    assert 'withAuth' in route
    assert 'tenantId: session.tenantId' in route
    assert 'canEditLead(session.role, lead, session.userId)' in route
    assert 'saleValueCents: newValueCents' in route
    assert "saleCurrency: 'BRL'" in route
    assert 'saleValueUpdatedAt: new Date()' in route
    assert 'saleValueUpdatedBy: session.userId' in route
    assert "action: 'lead.sale_value_updated'" in route
    assert 'previousValueCents' in route and 'newValueCents' in route


def test_lead_detail_has_commercial_block_and_explicit_save():
    modal = (ROOT / "components/lead-detail-modal.tsx").read_text()
    assert 'Comercial' in modal
    assert 'Valor vendido' in modal
    assert 'Informe o valor vendido para contabilizar na receita do Dashboard.' in modal
    assert 'Este valor só entra como receita quando o lead estiver na etapa final do funil.' in modal
    assert 'Este valor já está sendo contabilizado na receita.' in modal
    assert 'Salvar valor' in modal
    assert 'Valor vendido atualizado.' in modal
    assert 'Não foi possível salvar o valor vendido.' in modal
    assert '/sale-value' in modal
