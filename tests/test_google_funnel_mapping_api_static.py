from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = 'lib/tracking/google-funnel-mappings.ts'
ROUTES = [
    'app/api/integrations/google-funnel/mappings/route.ts',
    'app/api/integrations/google-funnel/mappings/[id]/route.ts',
]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_routes_require_integration_permissions_and_session_tenant():
    collection, item = (read(path) for path in ROUTES)
    assert "export const GET = withPermission('INTEGRATIONS_VIEW'" in collection
    assert "export const POST = withPermission('INTEGRATIONS_EDIT'" in collection
    assert "export const PUT = withPermission('INTEGRATIONS_EDIT'" in item
    assert "export const DELETE = withPermission('INTEGRATIONS_EDIT'" in item
    for source in (collection, item):
        assert 'tenantId: session.tenantId' in source
        assert 'body.tenantId' not in source
        assert 'logPlatformAudit' in source
        assert 'isGoogleFunnelSchemaPendingError' in source
    for source in (collection.split('export const POST')[1], item):
        assert 'rateLimit(' in source


def test_every_query_is_scoped_to_the_tenant():
    module = read(MODULE)
    queries = module.split('prisma.googleConversionMapping.find')[1:]
    assert len(queries) == 5
    for query in queries:
        where = query.split('});')[0]
        assert 'tenantId' in where, where
    assert "pipeline: { tenantId, isArchived: false }" in module
    assert 'googleFunnelMappingSchema.safeParse' in module


def test_removal_is_logical_and_preserves_history():
    module = read(MODULE)
    assert 'googleConversionMapping.delete' not in module
    assert 'deleteMany' not in module
    assert 'archivedAt: new Date()' in module
    assert 'enabled: false, archivedAt: new Date()' in module
    for path in ROUTES:
        assert '.delete(' not in read(path)


def test_configuration_layer_never_dispatches_or_touches_other_domains():
    combined = read(MODULE) + ''.join(read(path) for path in ROUTES)
    for forbidden in [
        'fetch(',
        'googleConversionEvent',
        'sendMetaCapiEvent',
        'dispatchKanbanStageTracking',
        'kanbanStageTrackingEvent',
        'tenantIntegrationSettings',
        'prisma.lead.',
        'leadAttribution',
        'TenantMetaConnection',
        'process.env',
    ]:
        assert forbidden not in combined, forbidden


def test_responses_do_not_expose_internal_columns():
    module = read(MODULE)
    serializer = module.split('export function serializeGoogleFunnelMapping')[1].split('export type')[0]
    returned = serializer.split('return {')[1]
    for hidden in ['tenantId', 'createdById', 'updatedById', 'archivedAt']:
        assert hidden not in returned, hidden
