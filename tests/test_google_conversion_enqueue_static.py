from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTBOX = 'lib/tracking/google-funnel-outbox.ts'
MOVE = 'app/api/leads/[id]/move/route.ts'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_move_route_queues_after_the_committed_transition_and_keeps_meta():
    route = read(MOVE)
    commit = route.index('await prisma.$transaction([')
    meta = route.index('await dispatchKanbanStageTracking({')
    google = route.index('const googleEvents = await enqueueGoogleConversionEvents({')
    audit = route.index('await logAudit({')
    assert commit < meta < google < audit
    assert 'transitionId: stageHistory.id' in route
    assert 'occurredAt: stageHistory.createdAt' in route
    assert 'tenantId: session.tenantId' in route
    assert "source: 'kanban'" in route
    assert 'return NextResponse.json({ ok: true, trackingEvents })' in route


def test_enqueue_is_best_effort_and_never_throws_into_the_crm():
    outbox = read(OUTBOX)
    public = outbox.split('export async function enqueueGoogleConversionEvents')[1]
    assert 'try {' in public and 'catch (error)' in public
    assert 'return [];' in public
    assert 'throw' not in public
    assert "console.error('google conversion enqueue skipped', { code })" in public


def test_enqueue_only_queues_and_never_sends_or_mutates_the_crm():
    outbox = read(OUTBOX)
    for forbidden in [
        'fetch(',
        'googleapis',
        'process.env',
        'prisma.lead.update',
        'prisma.lead.delete',
        'leadStageHistory',
        'leadAttribution',
        'kanbanStageTrackingEvent',
        'sendMetaCapiEvent',
        '.delete(',
        'deleteMany',
        'googleConversionEvent.update',
        'googleConversionMapping.update',
        'googleConversionMapping.create',
    ]:
        assert forbidden not in outbox, forbidden
    assert "state: 'PENDING'" in outbox
    assert 'buildGoogleConversionIdempotencyKey' in outbox
    assert 'enabled: true, archivedAt: null' in outbox
    assert outbox.count('tenantId: input.tenantId') >= 4


def test_only_the_manual_kanban_move_queues_google_events():
    callers = []
    for folder in ['app', 'lib']:
        for path in (ROOT / folder).rglob('*.ts*'):
            if 'enqueueGoogleConversionEvents(' in path.read_text(encoding='utf-8'):
                callers.append(path.relative_to(ROOT).as_posix())
    assert sorted(callers) == [MOVE, OUTBOX]


def test_integration_suite_runs_in_ci():
    ci = read('.github/workflows/ci.yml')
    assert 'tests/google-funnel-outbox.integration.test.ts' in ci
