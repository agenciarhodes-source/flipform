import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';

const deprecated = () => NextResponse.json(
  {
    code: 'WHATSAPP_FUNNEL_DEPRECATED',
    error: 'O Funil WhatsApp por frases-gatilho foi descontinuado.',
  },
  { status: 410 },
);

export const GET = withPermission('INTEGRATIONS_VIEW', async () => deprecated());
export const POST = withPermission('INTEGRATIONS_EDIT', async () => deprecated());
