import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import {
  getPlatformInstagramSettingsForAdmin,
  updatePlatformInstagramSettings,
} from '@/lib/meta/platform-settings';
import { getInstagramRuntimeReadiness } from '@/lib/meta/instagram-runtime-readiness';
import { INSTAGRAM_OAUTH_CALLBACK_PATH } from '@/lib/meta/instagram-platform';

const INSTAGRAM_WEBHOOK_PATH = '/api/webhooks/meta/instagram';

const schema = z.object({
  instagramAppId: z.string().trim().max(128),
  instagramAppSecret: z.string().trim().min(1).max(512).optional(),
}).strict();

function endpoints() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    oauthCallback: `${base}${INSTAGRAM_OAUTH_CALLBACK_PATH}`,
    webhook: `${base}${INSTAGRAM_WEBHOOK_PATH}`,
  };
}

async function payload() {
  const [settings, readiness] = await Promise.all([
    getPlatformInstagramSettingsForAdmin(),
    getInstagramRuntimeReadiness(),
  ]);
  return { settings, readiness, endpoints: endpoints() };
}

export const GET = withPlatformAdmin(async () => NextResponse.json(await payload()));

export const PUT = withPlatformAdmin(async (req, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Configuração do Instagram inválida.' }, { status: 400 });
  }

  await updatePlatformInstagramSettings(parsed.data, session.userId);
  return NextResponse.json(await payload());
});
