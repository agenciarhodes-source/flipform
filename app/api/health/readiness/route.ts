import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function bool(v: string | undefined) {
  return Boolean(v && String(v).trim());
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-internal-secret') || '';
  if (!process.env.INTERNAL_JOB_SECRET || secret !== process.env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 });
  }

  const checks = {
    database: false,
    env: false,
    asaasConfig: false,
    emailConfig: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {}

  checks.env = bool(process.env.JWT_SECRET_CURRENT) && bool(process.env.NEXT_PUBLIC_APP_URL);
  checks.asaasConfig = bool(process.env.ASAAS_BASE_URL) && bool(process.env.ASAAS_API_KEY) && bool(process.env.ASAAS_WEBHOOK_TOKEN);
  const provider = String(process.env.EMAIL_PROVIDER || 'none');
  checks.emailConfig = provider === 'none' || (provider === 'smtp' ? bool(process.env.SMTP_HOST) : bool(process.env.RESEND_API_KEY));

  const ok = checks.database && checks.env && checks.asaasConfig && checks.emailConfig;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
