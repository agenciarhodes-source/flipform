import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';

export const POST = withPermission('INTEGRATIONS_EDIT', async () => NextResponse.json(
  {
    code: 'WHATSAPP_FUNNEL_DEPRECATED',
    error: 'O Funil WhatsApp por frases-gatilho foi descontinuado.',
  },
  { status: 410 },
));
