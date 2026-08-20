import { NextResponse } from 'next/server';
import { runAutomationWorker } from '@/lib/automation';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { captureServerException } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handleAutomationCoreJob(req: Request) {
  if (!isCronRequestAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAutomationWorker();
    if (result.claimed > 0 || result.errors > 0) {
      console.info('Automation core central worker processed', result);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    captureServerException(error, {
      route: '/api/internal/jobs/automation-core',
      method: req.method,
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export const GET = handleAutomationCoreJob;
export const POST = handleAutomationCoreJob;
