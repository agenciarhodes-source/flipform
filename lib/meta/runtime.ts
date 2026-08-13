import 'server-only';

import { prisma } from '@/lib/prisma';
import { PLATFORM_META_SETTINGS_ID } from '@/lib/meta/platform-settings';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

const META_PIXEL_ID_PATTERN = /^[0-9]{5,30}$/;

export type MetaRuntimeSource = 'universal' | 'legacy' | 'none';

export type MetaRuntimeConfig = {
  source: MetaRuntimeSource;
  pixelId: string | null;
  accessToken: string | null;
  pixelEnabled: boolean;
  capiEnabled: boolean;
  testEventCode: string | null;
};

type LegacyMetaSettings = {
  metaPixelEnabled?: boolean | null;
  metaPixelId?: string | null;
  metaAccessTokenEncrypted?: string | null;
  metaTestEventCode?: string | null;
} | null;

type RuntimeDb = Pick<typeof prisma, 'platformMetaSettings' | 'tenantMetaConnection' | 'tenantIntegrationSettings'>;

function safeDecrypt(value: string | null | undefined): string | null {
  try {
    return decryptIntegrationSecret(value);
  } catch {
    return null;
  }
}

function validPixelId(value: string | null | undefined): string | null {
  const pixelId = value?.trim() || '';
  return META_PIXEL_ID_PATTERN.test(pixelId) ? pixelId : null;
}

export async function resolveMetaRuntimeConfig(input: {
  tenantId: string;
  legacySettings?: LegacyMetaSettings;
  db?: RuntimeDb;
  now?: Date;
}): Promise<MetaRuntimeConfig> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();

  const [platformSettings, connection] = await Promise.all([
    db.platformMetaSettings.findUnique({
      where: { id: PLATFORM_META_SETTINGS_ID },
      select: { defaultPixelEnabled: true, defaultCapiEnabled: true },
    }),
    db.tenantMetaConnection.findFirst({
      where: {
        tenantId: input.tenantId,
        status: 'authorized',
        metaPixelId: { not: null },
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        accessTokenEncrypted: true,
        tokenExpiresAt: true,
        metaPixelId: true,
      },
    }),
  ]);

  const universalPixelId = validPixelId(connection?.metaPixelId);
  const universalTokenUsable = !connection?.tokenExpiresAt || connection.tokenExpiresAt > now;

  // Once a valid universal connection + selected Pixel exists, it is authoritative.
  // We intentionally do not fall back to legacy settings just because token decryption
  // fails or a platform default disables one channel; that would risk sending browser
  // Pixel and CAPI to different data sources.
  if (platformSettings && connection && universalPixelId && universalTokenUsable) {
    return {
      source: 'universal',
      pixelId: universalPixelId,
      accessToken: safeDecrypt(connection.accessTokenEncrypted),
      pixelEnabled: Boolean(platformSettings.defaultPixelEnabled),
      capiEnabled: Boolean(platformSettings.defaultCapiEnabled),
      testEventCode: null,
    };
  }

  const legacy = input.legacySettings === undefined
    ? await db.tenantIntegrationSettings.findUnique({ where: { tenantId: input.tenantId } })
    : input.legacySettings;
  const legacyPixelId = validPixelId(legacy?.metaPixelId);

  if (!legacy) {
    return {
      source: 'none',
      pixelId: null,
      accessToken: null,
      pixelEnabled: false,
      capiEnabled: false,
      testEventCode: null,
    };
  }

  return {
    source: 'legacy',
    pixelId: legacyPixelId,
    accessToken: safeDecrypt(legacy.metaAccessTokenEncrypted),
    pixelEnabled: Boolean(legacy.metaPixelEnabled && legacyPixelId),
    capiEnabled: Boolean(legacy.metaPixelEnabled && legacyPixelId),
    testEventCode: legacy.metaTestEventCode || null,
  };
}

export function toPublicMetaPixelConfig(config: MetaRuntimeConfig, eventId: string) {
  if (!config.pixelEnabled || !config.pixelId) return undefined;
  return { pixelId: config.pixelId, eventId };
}
