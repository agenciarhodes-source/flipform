import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { getAsaasHealthStatus } from '@/lib/asaas';

export const GET = withPlatformAdmin(async () => {
  return NextResponse.json(getAsaasHealthStatus());
});
