from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR = 'lib/tracking/google-funnel-processor.ts'
ROUTE = 'app/api/cron/google-conversions/route.ts'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_cron_route_is_authenticated_before_processing():
    route = read(ROUTE)
    auth = route.index('if (!isCronRequestAuthorized(req))')
    run = route.index('await processGoogleConversionOutbox()')
    assert auth < run
    assert "status: 401" in route
    assert 'rateLimit(' in route
    # Both verbs share the same authenticated handler.
    assert route.count('return run(req,') == 2
    assert route.count('isCronRequestAuthorized') == 2


def test_scheduler_stays_decoupled_from_vercel_cron():
    assert not (ROOT / 'vercel.json').exists()


def test_move_route_schedules_delivery_after_the_response_only_when_queued():
    move = read('app/api/leads/[id]/move/route.ts')
    assert "if (googleEvents.some((event) => event.status === 'queued')) scheduleGoogleConversionDelivery();" in move
    assert 'await scheduleGoogleConversionDelivery' not in move
    assert 'processGoogleConversionOutbox' not in move
    processor = read(PROCESSOR)
    schedule = processor.split('export function scheduleGoogleConversionDelivery')[1]
    assert schedule.index('if (!config.enabled) return false;') < schedule.index('processGoogleConversionOutbox({ config })')
    assert 'scheduleAfterResponse(work)' in schedule


def test_processor_stops_before_reading_when_gates_are_closed():
    processor = read(PROCESSOR)
    read_queue = processor.index('prisma.googleConversionEvent.findMany')
    for gate in ["emptySummary('transport_disabled')", "emptySummary('credentials_missing')", "emptySummary('no_paired_tenant')"]:
        assert processor.index(gate, processor.index('export async function processGoogleConversionOutbox')) < read_queue
    assert 'tenantId: { in: pairedTenantIds }' in processor


def test_processor_only_writes_the_outbox():
    processor = read(PROCESSOR)
    for forbidden in [
        'prisma.lead.update',
        'prisma.lead.delete',
        'leadAttribution.update',
        'leadAttribution.create',
        'leadStageHistory',
        'googleConversionMapping',
        'kanbanStageTrackingEvent',
        'sendMetaCapiEvent',
        'trackingEventLog',
        '.delete(',
        'deleteMany',
        'console.',
    ]:
        assert forbidden not in processor, forbidden
    assert 'where: { id: event.leadId, tenantId: event.tenantId }' in processor
    assert 'where: { id: event.id, tenantId: event.tenantId, state: event.state, attempts: event.attempts }' in processor


def test_only_the_cron_route_runs_the_processor():
    callers = []
    for folder in ['app', 'lib']:
        for path in (ROOT / folder).rglob('*.ts*'):
            if 'processGoogleConversionOutbox(' in path.read_text(encoding='utf-8'):
                callers.append(path.relative_to(ROOT).as_posix())
    assert sorted(callers) == [ROUTE, PROCESSOR]


def test_processor_integration_suite_runs_in_ci():
    assert 'tests/google-funnel-processor.integration.test.ts' in read('.github/workflows/ci.yml')
