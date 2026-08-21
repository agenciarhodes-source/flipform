from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKING = (ROOT / 'lib/tracking.ts').read_text(encoding='utf-8')
PURCHASE_ROUTE = (ROOT / 'app/api/leads/[id]/purchases/route.ts').read_text(encoding='utf-8')
LOGS = (ROOT / 'lib/tracking/logs.ts').read_text(encoding='utf-8')
CLIENT = (ROOT / 'app/(app)/integrations/integrations-client.tsx').read_text(encoding='utf-8')


def test_purchase_is_driven_by_explicit_lead_purchase_not_stage_only():
    assert "source: 'public_form' | 'kanban' | 'purchase' | 'test'" in TRACKING
    assert "status: 'awaiting_purchase'" in TRACKING
    assert "select: { id: true, amountCents: true, currency: true }" in TRACKING
    assert 'conversionValue: explicitPurchase.amountCents / 100' in TRACKING
    assert "currency: explicitPurchase.currency || 'BRL'" in TRACKING


def test_each_explicit_purchase_has_stable_meta_event_id_and_is_idempotent():
    assert "return `meta-purchase:${context.purchase.id}`" in TRACKING
    assert 'async function shouldSkipEventId(provider: string, eventId: string)' in TRACKING
    assert "status: { in: ['pending', 'sent'] }" in TRACKING
    assert "status: 'duplicate'" in TRACKING


def test_registering_purchase_dispatches_tracking_after_persist_without_blocking_sale():
    create_index = PURCHASE_ROUTE.index('const purchase = await prisma.leadPurchase.create')
    dispatch_index = PURCHASE_ROUTE.index('trackingEvents = await dispatchLeadPurchaseTracking')
    assert create_index < dispatch_index
    assert "purchase: { id: purchase.id, amountCents: purchase.amountCents, currency: purchase.currency }" in PURCHASE_ROUTE
    assert "console.error('purchase tracking failed after purchase was persisted'" in PURCHASE_ROUTE
    assert "return NextResponse.json({ purchase, message: 'Compra registrada com sucesso.', trackingEvents }" in PURCHASE_ROUTE


def test_purchase_dispatch_only_uses_existing_meta_purchase_mapping_for_current_stage():
    purchase_dispatch = TRACKING.split('export async function dispatchLeadPurchaseTracking', 1)[1]
    assert "stageId: context.toStageId" in purchase_dispatch
    assert "provider: 'meta'" in purchase_dispatch
    assert "eventName: 'Purchase'" in purchase_dispatch
    assert 'kanbanStageTrackingEvent.create' not in purchase_dispatch
    assert 'kanbanStageTrackingEvent.update' not in purchase_dispatch


def test_purchase_ui_does_not_request_or_persist_a_fake_fixed_value():
    assert "const payload = isMetaPurchase ? { ...form, conversionValue: null, currency: 'BRL' } : form" in CLIENT
    assert 'disabled={isMetaPurchase}' in CLIENT
    assert "value={isMetaPurchase ? '' : form.conversionValue||''}" in CLIENT
    assert 'Informe um valor de conversão para eventos Purchase.' not in CLIENT
    assert 'O valor e a moeda vêm automaticamente da compra registrada no lead.' in CLIENT


def test_legacy_missing_value_skip_is_hidden_without_deleting_history():
    assert "'Meta Purchase não enviado: venda sem valor monetário registrado.'" in LOGS
    assert "log.status === 'skipped'" in LOGS
    assert 'continue;' in LOGS
    assert '.delete(' not in LOGS
    assert '.deleteMany(' not in LOGS


def test_no_commercial_data_deletion_or_schema_mutation_in_purchase_fix():
    combined = '\n'.join((TRACKING, PURCHASE_ROUTE, LOGS, CLIENT))
    for forbidden in (
        'prisma.lead.delete',
        'prisma.lead.deleteMany',
        'prisma.leadPurchase.delete',
        'prisma.leadPurchase.deleteMany',
        'DROP TABLE',
        'TRUNCATE ',
    ):
        assert forbidden not in combined
