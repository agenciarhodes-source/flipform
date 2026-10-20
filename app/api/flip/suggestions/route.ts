import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { listFlipSuggestions, refreshFlipSuggestions } from '@/lib/flip/suggestions';

/** The Flip's pending suggestions for the person signed in, brought up to date first. */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session) => {
  await refreshFlipSuggestions(session).catch((error) => console.error('Flip suggestions refresh failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
  const suggestions = await listFlipSuggestions(session).catch(() => []);
  return NextResponse.json({ suggestions });
});
