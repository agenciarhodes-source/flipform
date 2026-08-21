import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  updateWhatsAppMessageAutomation,
  WhatsAppMessageAutomationConfigError,
} from '@/lib/automation/whatsapp-message-config';

const ensureLeadSchema = z.object({
  pipelineId: z.string().trim().min(1).max(128),
  stageId: z.string().trim().min(1).max(128),
  temperature: z.enum(['cold', 'warm', 'hot']).default('warm'),
}).strict();

const moveLeadSchema = z.object({
  pipelineId: z.string().trim().min(1).max(128),
  stageId: z.string().trim().min(1).max(128),
}).strict();

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  keyword: z.string().trim().min(1).max(160),
  matchType: z.enum(['exact', 'contains']),
  replyText: z.string().trim().min(1).max(4096),
  enabled: z.boolean(),
  orderIndex: z.number().int().min(0).max(10000),
  ensureLead: ensureLeadSchema.nullable().optional().default(null),
  moveLead: moveLeadSchema.nullable().optional().default(null),
}).strict();

export const PATCH = withPermission(
  'INTEGRATIONS_EDIT',
  async (req: NextRequest, session, ctx: { params: { id: string } }) => {
    const rl = rateLimit({
      key: `whatsapp-message-automation-update:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = ruleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Automação do WhatsApp inválida.' }, { status: 400 });
    }

    try {
      const rule = await updateWhatsAppMessageAutomation({
        tenantId: session.tenantId,
        userId: session.userId,
        ruleId: ctx.params.id,
        ...parsed.data,
      });
      return NextResponse.json({ rule });
    } catch (error) {
      if (error instanceof WhatsAppMessageAutomationConfigError) {
        if (error.code === 'NOT_FOUND') {
          return NextResponse.json({ error: 'Automação não encontrada.' }, { status: 404 });
        }
        if (error.code === 'INVALID_REQUEST') {
          return NextResponse.json({ error: 'Automação do WhatsApp inválida.' }, { status: 400 });
        }
      }
      console.error('WhatsApp message automation update failed', {
        tenantId: session.tenantId,
        userId: session.userId,
        ruleId: ctx.params.id,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return NextResponse.json({ error: 'Não foi possível atualizar a automação agora.' }, { status: 500 });
    }
  },
);
