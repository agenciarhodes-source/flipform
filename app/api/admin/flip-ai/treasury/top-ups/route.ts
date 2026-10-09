import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { listTopUpFunding } from '@/lib/flip-ai/top-up-funding';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const GET = withPlatformAdmin(async () => {
  try {
    return NextResponse.json(await listTopUpFunding(), { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível carregar as recargas dos clientes.' },
      { status: 503, headers: NO_STORE },
    );
  }
});
