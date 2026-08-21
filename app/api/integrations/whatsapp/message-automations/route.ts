import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  createWhatsAppMessageAutomation,
  listWhatsAppMessageAutomations,
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
  matchType: z.enum(['exact', 'contains']).default('contains'),
  replyText: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
  orderIndex: z.number().int().min(0).max(10000).default(0),
  ensureLead: ensureLeadSchema.nullable().optional().default(null),
  moveLead: moveLeadSchema.nullable().optional().default(null),
}).strict();

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req: NextRequest, session) => {
  const rules = await listWhatsAppMessageAutomations(session.tenantId);
  return NextResponse.json({ rules });
});

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-message-automation-create:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = ruleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Automação do WhatsApp inválida.' }, { status: 400 });
  }

  try {
    const rule = await createWhatsAppMessageAutomation({
      tenantId: session.tenantId,
      userId: session.userId,
      ...parsed.data,
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof WhatsAppMessageAutomationConfigError && error.code === 'INVALID_REQUEST') {
      return NextResponse.json({ error: 'Automação do WhatsApp inválida.' }, { status: 400 });
    }
    console.error('WhatsApp message automation create failed', {
      tenantId: session.tenantId,
      userId: session.userId,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível criar a automação agora.' }, { status: 500 });
  }
});
