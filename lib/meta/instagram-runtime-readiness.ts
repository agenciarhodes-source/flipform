import 'server-only';

import { prisma } from '@/lib/prisma';
import { isPlatformInstagramLoginAvailable } from './instagram-platform';
import { getInstagramWebhookVerifyToken } from './instagram-runtime-credentials';

const REQUIRED_INSTAGRAM_RUNTIME_TABLES = [
  'tenant_instagram_connections',
  'external_contact_identities',
  'conversations',
  'messages',
  'webhook_events',
] as const;

export type InstagramRuntimeReadiness = {
  ready: boolean;
  platformConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
  schemaReady: boolean;
  missingTables: string[];
};

async function getSchemaReadiness() {
  const rows = await prisma.$queryRaw<Array<{
    tenant_instagram_connections: boolean;
    external_contact_identities: boolean;
    conversations: boolean;
    messages: boolean;
    webhook_events: boolean;
  }>>`
    SELECT
      to_regclass('public.tenant_instagram_connections') IS NOT NULL AS tenant_instagram_connections,
      to_regclass('public.external_contact_identities') IS NOT NULL AS external_contact_identities,
      to_regclass('public.conversations') IS NOT NULL AS conversations,
      to_regclass('public.messages') IS NOT NULL AS messages,
      to_regclass('public.webhook_events') IS NOT NULL AS webhook_events
  `;

  const row = rows[0];
  const missingTables = REQUIRED_INSTAGRAM_RUNTIME_TABLES.filter(table => !row?.[table]);
  return {
    schemaReady: missingTables.length === 0,
    missingTables: [...missingTables],
  };
}

export async function getInstagramRuntimeReadiness(): Promise<InstagramRuntimeReadiness> {
  const [platformConfigured, schema] = await Promise.all([
    isPlatformInstagramLoginAvailable().catch(() => false),
    getSchemaReadiness().catch(() => ({
      schemaReady: false,
      missingTables: [...REQUIRED_INSTAGRAM_RUNTIME_TABLES],
    })),
  ]);
  const webhookVerifyTokenConfigured = Boolean(getInstagramWebhookVerifyToken());

  return {
    ready: Boolean(platformConfigured && webhookVerifyTokenConfigured && schema.schemaReady),
    platformConfigured,
    webhookVerifyTokenConfigured,
    schemaReady: schema.schemaReady,
    missingTables: schema.missingTables,
  };
}

export async function isInstagramRuntimeReady() {
  const readiness = await getInstagramRuntimeReadiness();
  return readiness.ready;
}
