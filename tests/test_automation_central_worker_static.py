from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_central_worker_uses_shared_core_queue_and_explicit_handler_registry():
    worker = read('lib/automation/worker.ts')
    index = read('lib/automation/index.ts')

    assert 'createAutomationWorkerHandlers' in worker
    assert 'INSTAGRAM_PRIVATE_REPLY_ACTION' in worker
    assert 'createInstagramPrivateReplyAutomationHandler()' in worker
    assert 'drainAutomationExecutionQueue({' in worker
    assert 'AUTOMATION_CENTRAL_WORKER_BATCH_SIZE = 25' in worker
    assert 'runAutomationWorker' in index


def test_internal_worker_route_is_cron_secret_protected_and_supports_manual_post():
    route = read('app/api/internal/jobs/automation-core/route.ts')

    assert 'isCronRequestAuthorized(req)' in route
    assert "route: '/api/internal/jobs/automation-core'" in route
    assert 'runAutomationWorker()' in route
    assert 'export const GET = handleAutomationCoreJob' in route
    assert 'export const POST = handleAutomationCoreJob' in route
    assert "export const runtime = 'nodejs'" in route
    assert 'export const maxDuration = 60' in route


def test_vercel_runs_central_worker_every_minute():
    config = json.loads(read('vercel.json'))
    assert config['crons'] == [{
        'path': '/api/internal/jobs/automation-core',
        'schedule': '* * * * *',
    }]


def test_instagram_keeps_low_latency_worker_but_retries_no_longer_depend_on_new_webhooks():
    route = read('app/api/webhooks/meta/instagram/route.ts')
    cron = read('app/api/internal/jobs/automation-core/route.ts')

    assert 'runAutomationWorker()' in route
    assert 'runAutomationWorker()' in cron
    assert 'reclaimed by the central scheduled worker' in route
