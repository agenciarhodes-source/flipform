from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = [
    'app/api/leads/[id]/move/route.ts',
    'lib/leads/move-stage.ts',
]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def test_manual_and_assistant_moves_use_atomic_state_comparison():
    for path in ROUTES:
        src = read(path)
        assert 'await prisma.$transaction(async (tx) => {' in src, path
        assert 'await tx.lead.updateMany({' in src, path
        assert 'tenantId:' in src and 'pipelineId: lead.pipelineId' in src, path
        assert 'stageId: lead.stageId' in src and 'status: lead.status' in src, path
        assert 'if (updated.count !== 1) return null;' in src, path
        assert src.index('if (updated.count !== 1) return null;') < src.index('return tx.leadStageHistory.create({'), path

def test_manual_conflict_is_409_before_any_tracking_or_audit():
    src = read(ROUTES[0])
    conflict = src.index('if (!stageHistory) {')
    assert 'status: 409' in src[conflict:conflict+220]
    assert conflict < src.index('await dispatchKanbanStageTracking({')
    assert conflict < src.index('await enqueueGoogleConversionEvents({')
    assert conflict < src.index('await logAudit({')

def test_assistant_conflict_aborts_tracking_and_has_no_history():
    src = read(ROUTES[1])
    conflict = src.index("if (!stageHistory) return { moved: false as const, reason: 'concurrent_update' };")
    assert conflict < src.index('await dispatchKanbanStageTracking({')
    assert conflict < src.index('await enqueueGoogleConversionEvents({')
    assert conflict < src.index('await logAudit({')

def test_meta_and_google_event_calls_are_unchanged():
    for path in ROUTES:
        src = read(path)
        assert 'dispatchKanbanStageTracking({' in src
        assert 'enqueueGoogleConversionEvents({' in src
        assert 'scheduleGoogleConversionDelivery()' in src
