import { NextResponse } from 'next/server';

export const POST = async () => NextResponse.json(
  {
    code: 'WHATSAPP_FUNNEL_DEPRECATED',
    error: 'O Funil WhatsApp por frases-gatilho foi descontinuado.',
  },
  { status: 410 },
);
