from pathlib import Path

METRICS = Path('lib/dashboard-metrics.ts').read_text()
PURCHASES = Path('lib/lead-purchases.ts').read_text()
TRACKING = Path('lib/tracking.ts').read_text()


def test_daily_revenue_is_initialized_independently_from_lead_counts():
    assert 'const revenueByDayMap = new Map<string, number>();' in METRICS
    assert 'const revenueByDayMap = new Map(byDayMap);' not in METRICS
    assert 'revenueCents }))' in METRICS


def test_dashboard_financial_values_only_sum_explicit_purchases():
    assert 'const fallbackLeads = await db.lead.findMany' not in METRICS
    assert 'fallbackRevenueCents' not in METRICS
    assert 'return purchases.reduce((sum: number, purchase: any) => sum + purchase.amountCents, 0);' in METRICS


def test_legacy_sale_value_is_not_an_official_revenue_fallback():
    assert 'getExplicitLeadRevenueCents' in PURCHASES
    assert 'saleValueCents' not in PURCHASES.split('export function getLeadRevenueSource', 1)[1]


def test_meta_purchase_is_skipped_without_an_explicit_purchase():
    assert "amountCents: { gt: 0 }" in TRACKING
    assert 'Meta Purchase não enviado: venda sem valor monetário registrado.' in TRACKING
    assert 'conversionValue: purchase.amountCents / 100' in TRACKING
