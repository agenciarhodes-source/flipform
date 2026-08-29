import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { getWhatsAppPlatformPreflightForAdmin } from '@/lib/meta/whatsapp-platform-preflight';

export const dynamic = 'force-dynamic';

export const POST = withPlatformAdmin(async () => {
  const preflight = await getWhatsAppPlatformPreflightForAdmin();
  return NextResponse.json({ preflight });
});
