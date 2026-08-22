import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { getInstagramRuntimeReadiness } from '@/lib/meta/instagram-runtime-readiness';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  const readiness = await getInstagramRuntimeReadiness();
  return NextResponse.json({ readiness });
});
