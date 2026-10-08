import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { FLIP_AI_TEXT_MODEL_CATALOG, isSelectableFlipAiTextModel } from '@/lib/flip-ai/text-model-catalog';
import { getActiveFlipAiTextModel, probeFlipAiTextModel, setActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';

export const dynamic = 'force-dynamic';
// Activation waits for a live model probe before saving.
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const GET = withPlatformAdmin(async () => {
  const active = await getActiveFlipAiTextModel();
  return NextResponse.json({ active, models: FLIP_AI_TEXT_MODEL_CATALOG }, { headers: NO_STORE });
});

export const PUT = withPlatformAdmin(async (req, session) => {
  const body = await req.json().catch(() => null);
  const model = body && typeof body === 'object' ? (body as { model?: unknown }).model : null;
  // Only catalogued (priced) models can be activated; anything else is refused.
  if (!isSelectableFlipAiTextModel(model)) {
    return NextResponse.json({ error: 'Modelo não disponível para ativação.' }, { status: 400, headers: NO_STORE });
  }

  const previous = await getActiveFlipAiTextModel();
  // A model that cannot answer a real-shaped request is never activated for customers.
  const probe = await probeFlipAiTextModel(model);
  if (!probe.ok) {
    return NextResponse.json({
      error: 'O modelo não respondeu ao teste de ativação. O modelo atual foi mantido.',
      code: probe.code,
    }, { status: 502, headers: NO_STORE });
  }

  try {
    const active = await setActiveFlipAiTextModel({ model, userId: session.userId });
    await logPlatformAudit({
      userId: session.userId,
      entityType: 'platform',
      entityId: 'flip_ai_text_model',
      action: 'platform.flip_ai_text_model_changed',
      metadata: { previous: previous.model, next: active.model },
    });
    return NextResponse.json({ ok: true, active, models: FLIP_AI_TEXT_MODEL_CATALOG }, { headers: NO_STORE });
  } catch (error) {
    const missingTable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
    return NextResponse.json({
      error: missingTable
        ? 'A seleção de modelo ainda não está disponível neste ambiente: a tabela de configuração não foi aplicada.'
        : 'Não foi possível salvar o modelo ativo.',
    }, { status: missingTable ? 503 : 500, headers: NO_STORE });
  }
});
