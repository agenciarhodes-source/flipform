from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_customers_navigation_is_directly_after_leads():
    shell = read('components/app-shell.tsx')
    leads = shell.index('{ href: "/leads", label: "Leads"')
    customers = shell.index('{ href: "/customers", label: "Clientes"')
    inbox = shell.index('{ href: "/inbox", label: "Inbox"')
    assert leads < customers < inbox
    assert 'permission: "LEADS_VIEW"' in shell[customers:customers + 140]

def test_customers_api_uses_purchases_as_source_of_truth_and_respects_lead_scope():
    route = read('app/api/customers/route.ts')
    assert "withPermission('LEADS_VIEW'" in route
    assert 'tenantId: session.tenantId' in route
    assert 'getLeadScopeForRole(session)' in route
    assert 'prisma.leadPurchase.findMany' in route
    assert 'purchaseCount' in route
    assert 'totalAmountCents' in route
    assert 'averageTicketCents' in route
    assert 'preferredPaymentMethod' in route
    assert "sort === 'amount'" in route
    assert "b.purchaseCount - a.purchaseCount" in route
    assert "b.totalAmountCents - a.totalAmountCents" in route

def test_customers_page_has_requested_best_customer_views_and_purchase_history():
    page = read('app/(app)/customers/page.tsx')
    for label in ['Clientes', 'Melhores clientes', 'Quem mais comprou', 'Maior valor comprado', 'Pagamento preferido', 'Ticket médio', 'Histórico']:
        assert label in page
    assert 'customer.purchases.map' in page
    assert 'customer.purchaseCount' in page
    assert 'customer.totalAmountCents' in page
    assert 'customer.averageTicketCents' in page
    assert 'customer.preferredPaymentLabel' in page
    assert 'Ordem atual:' in page
