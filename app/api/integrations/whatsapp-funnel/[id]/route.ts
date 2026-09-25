import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';

const deprecated = () => NextResponse.json(
  {
    code: 'WHATSAPP_FUNNEL_DEPRECATED',
    error: 'O Funil WhatsApp por frases-gatilho foi descontinuado.',
  },
  { status: 410 },
);

export const PUT = withPermission('INTEGRATIONS_EDIT', async () => deprecated());
export const DELETE = withPermission('INTEGRATIONS_EDIT', async () => deprecated());
