import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { computeFlipAlerts } from '@/lib/flip/alerts';

/** The Flip's alerts for the person signed in. Read only. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session) => {
  return NextResponse.json(await computeFlipAlerts(session));
});
