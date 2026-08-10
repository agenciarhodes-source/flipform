import 'server-only';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret, encryptIntegrationSecret, looksMaskedSecret, maskSecretFromEncrypted } from '@/lib/tracking/crypto';

export const PLATFORM_META_SETTINGS_ID = 'meta';
export const META_OAUTH_CALLBACK_PATH = '/api/integrations/meta/callback';

export type PlatformMetaSettingsInput = {
  appId: string;
  appSecret?: string;
  defaultPixelEnabled: boolean;
  defaultCapiEnabled: boolean;
  defaultAdvancedMatchingEnabled: boolean;
  defaultAttributionEnabled: boolean;
  defaultQualifiedLeadEnabled: boolean;
  defaultPurchaseEnabled: boolean;
};

const DEFAULTS = {
  defaultPixelEnabled: true, defaultCapiEnabled: true,
  defaultAdvancedMatchingEnabled: true, defaultAttributionEnabled: true,
  defaultQualifiedLeadEnabled: true, defaultPurchaseEnabled: true,
};

export function getMetaOAuthRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${META_OAUTH_CALLBACK_PATH}`;
}

function toAdminDto(settings: any | null) {
  const encrypted = settings?.appSecretEncrypted || null;
  const appId = settings?.appId || null;
  return {
    appId,
    appSecretConfigured: Boolean(encrypted),
    appSecretMasked: maskSecretFromEncrypted(encrypted),
    redirectUri: getMetaOAuthRedirectUri(),
    ...DEFAULTS,
    ...(settings ? {
      defaultPixelEnabled: settings.defaultPixelEnabled,
      defaultCapiEnabled: settings.defaultCapiEnabled,
      defaultAdvancedMatchingEnabled: settings.defaultAdvancedMatchingEnabled,
      defaultAttributionEnabled: settings.defaultAttributionEnabled,
      defaultQualifiedLeadEnabled: settings.defaultQualifiedLeadEnabled,
      defaultPurchaseEnabled: settings.defaultPurchaseEnabled,
    } : {}),
    configured: Boolean(appId && encrypted),
    updatedAt: settings?.updatedAt || null,
    updatedBy: settings?.updatedBy || null,
  };
}

export async function getPlatformMetaSettingsForAdmin() {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    include: { updatedBy: { select: { id: true, name: true, email: true } } },
  });
  return toAdminDto(settings);
}

export async function isPlatformMetaAvailable() {
  const settings = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appId: true, appSecretEncrypted: true } });
  return Boolean(settings?.appId && settings.appSecretEncrypted);
}

export async function getPlatformMetaOAuthCredentials() {
  const settings = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appId: true, appSecretEncrypted: true } });
  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  if (!settings?.appId || !appSecret) return null;
  return { appId: settings.appId, appSecret };
}

export async function updatePlatformMetaSettings(input: PlatformMetaSettingsInput, updatedById: string) {
  const existing = await prisma.platformMetaSettings.findUnique({ where: { id: PLATFORM_META_SETTINGS_ID }, select: { appSecretEncrypted: true } });
  let appSecretEncrypted = existing?.appSecretEncrypted || null;
  if (input.appSecret && !looksMaskedSecret(input.appSecret)) appSecretEncrypted = encryptIntegrationSecret(input.appSecret);
  const { appSecret: _secret, ...safeInput } = input;
  await prisma.platformMetaSettings.upsert({
    where: { id: PLATFORM_META_SETTINGS_ID },
    create: { id: PLATFORM_META_SETTINGS_ID, ...safeInput, appId: input.appId || null, appSecretEncrypted, updatedById },
    update: { ...safeInput, appId: input.appId || null, appSecretEncrypted, updatedById },
  });
  return getPlatformMetaSettingsForAdmin();
}
