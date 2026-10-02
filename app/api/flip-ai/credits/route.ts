import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getFlipAiCreditStorefront } from '@/lib/flip-ai/self-service-credits';

export const dynamic = 'force-dynamic';

export const GET = withPermission('FLIP_AI_MANAGE', async (_req, session) => {
  try {
    const result = await getFlipAiCreditStorefront(session);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível carregar a carteira Flip AI.' },
      { status: 500 },
    );
  }
});
