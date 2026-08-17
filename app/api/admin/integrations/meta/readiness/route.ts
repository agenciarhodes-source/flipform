import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { getMetaPlatformReadinessForAdmin } from '@/lib/meta/platform-readiness';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  const readiness = await getMetaPlatformReadinessForAdmin();
  return NextResponse.json({ readiness });
});
