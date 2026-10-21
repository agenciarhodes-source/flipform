import { NextResponse } from 'next/server';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { runWeeklyAttendanceLearning } from '@/lib/flip/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Learning from the human attendance: the scheduler calls this once a day; each company runs once a week. */
async function handle(req: Request) {
  if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runWeeklyAttendanceLearning()) });
}

export const GET = handle;
export const POST = handle;
