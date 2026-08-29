import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { getMetaPlatformReadinessForAdmin } from '@/lib/meta/platform-readiness';
import { buildMetaRolloutReadiness } from '@/lib/meta/platform-rollout-readiness';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  const diagnostics = await getMetaPlatformReadinessForAdmin();
  const readiness = buildMetaRolloutReadiness(diagnostics);
  return NextResponse.json({ readiness });
});
