import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { getPlatformMetaSettingsForAdmin, updatePlatformMetaSettings } from '@/lib/meta/platform-settings';

const schema = z.object({
  appId: z.string().trim().max(128),
  appSecret: z.string().trim().min(1).max(512).optional(),
  businessLoginConfigId: z.string().trim().max(128),
  whatsappEmbeddedSignupConfigId: z.string().trim().max(128),
  defaultPixelEnabled: z.boolean(),
  defaultCapiEnabled: z.boolean(),
  defaultAdvancedMatchingEnabled: z.boolean(),
  defaultAttributionEnabled: z.boolean(),
  defaultQualifiedLeadEnabled: z.boolean(),
  defaultPurchaseEnabled: z.boolean(),
}).strict();

export const GET = withPlatformAdmin(async () => NextResponse.json({ settings: await getPlatformMetaSettingsForAdmin() }));

export const PUT = withPlatformAdmin(async (req, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Configuração inválida.', issues: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ settings: await updatePlatformMetaSettings(parsed.data, session.userId) });
});
