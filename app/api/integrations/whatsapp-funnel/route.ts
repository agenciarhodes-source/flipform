import { NextResponse } from 'next/server';

const deprecated = () => NextResponse.json(
  {
    code: 'WHATSAPP_FUNNEL_DEPRECATED',
    error: 'O Funil WhatsApp por frases-gatilho foi descontinuado.',
  },
  { status: 410 },
);

export const GET = deprecated;
export const POST = deprecated;
