import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getFlipAiTreasuryDashboard } from '@/lib/flip-ai/treasury';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  try {
    const treasury = await getFlipAiTreasuryDashboard();
    return NextResponse.json({ treasury }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    console.error('[admin/flip-ai/treasury][GET]', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
    return NextResponse.json({
      error: 'Não foi possível calcular a cobertura financeira do Flip AI.',
      code: 'FLIP_AI_TREASURY_FAILED',
    }, {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
});
