import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { processWhatsAppFunnelMessage } from '@/lib/tracking/whatsapp-funnel';
const schema = z.object({ tenantId: z.string().min(1), conversationId: z.string().optional().nullable(), messageId: z.string().optional().nullable(), leadId: z.string().optional().nullable(), phone: z.string().optional().nullable(), name: z.string().optional().nullable(), email: z.string().email().optional().nullable().or(z.literal('')), text: z.string().min(1), direction: z.enum(['inbound', 'outbound']), senderType: z.enum(['customer', 'agent', 'system']), timestamp: z.string().optional().nullable(), metadata: z.unknown().optional() });
function authorized(req: Request) { const configured = process.env.INTERNAL_JOB_SECRET || process.env.CRON_SECRET; if (!configured) return false; const header = req.headers.get('x-internal-token') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); return header === configured; }
export async function POST(req: Request) {
  const rl = rateLimit({ key: `whatsapp-message-webhook:${getClientIp(req)}`, limit: 120, windowMs: 60_000 }); if (!rl.allowed) return rateLimitResponse(rl);
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const result = await processWhatsAppFunnelMessage({ ...parsed.data, email: parsed.data.email || null }); return NextResponse.json({ ok: true, result });
}
