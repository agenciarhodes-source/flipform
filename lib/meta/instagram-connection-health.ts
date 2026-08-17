import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { getActiveInstagramConnection } from './instagram-connection';
import { isPlatformInstagramLoginAvailable } from './instagram-platform';
import { INSTAGRAM_WEBHOOK_FIELDS, validateInstagramProfessionalAccount } from './instagram';
import {
  getLatestConnectionHealthAudit,
  getRecentHealthFailure,
  jsonMetadata,
  writeConnectionHealthAudit,
} from './connection-health-audit';
import {
  classifyMetaConnectionProviderError,
  healthResult,
  isHealthStale,
  type HealthAuditSnapshot,
  type MetaConnectionHealth,
} from './connection-health-types';

export const INSTAGRAM_CONNECTION_HEALTH_ACTION = 'INSTAGRAM_CONNECTION_HEALTH_CHECKED';
const INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION = 'INSTAGRAM_WEBHOOK_SUBSCRIBED';
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60_000;

type InstagramHealthConnection = {
  id: string;
  status: string;
  connectedAt: Date;
  tokenExpiresAt: Date | null;
  lastValidatedAt: Date | null;
};

export function buildInstagramConnectionHealth(input: {
  connection: InstagramHealthConnection | null;
  platformAvailable: boolean;
  webhookSubscriptionComplete: boolean;
  latestHealthAudit: HealthAuditSnapshot;
  now?: Date;
}): MetaConnectionHealth {
  const now = input.now || new Date();
  const connection = input.connection;
  if (!connection) {
    return healthResult({
      now,
      state: 'not_connected',
      label: 'Não conectado',
      summary: 'Nenhuma conta do Instagram está conectada a esta empresa.',
      lastValidatedAt: null,
      reconnectRecommended: false,
      retryable: false,
      checks: [],
    });
  }

  if (connection.status !== 'connected') {
    const revoked = connection.status === 'revoked';
    return healthResult({
      now,
      state: revoked ? 'revoked' : 'action_required',
      label: revoked ? 'Desconectado' : 'Ação necessária',
      summary: revoked ? 'A conexão foi revogada no FlipForm.' : 'A conexão não está em estado operacional.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: true,
      retryable: false,
      checks: [{ key: 'binding_status', status: 'fail', detail: `Estado atual: ${connection.status}.` }],
    });
  }

  if (!input.platformAvailable) {
    return healthResult({
      now,
      state: 'action_required',
      label: 'Configuração da plataforma pendente',
      summary: 'O Super Admin precisa corrigir a configuração universal do Instagram antes de uma nova autorização.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: false,
      retryable: false,
      checks: [{ key: 'platform', status: 'fail', detail: 'Instagram Business Login indisponível na plataforma.' }],
    });
  }

  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= now.getTime()) {
    return healthResult({
      now,
      state: 'expired',
      label: 'Autorização expirada',
      summary: 'A autorização do Instagram expirou e precisa ser renovada.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: true,
      retryable: false,
      checks: [{ key: 'token', status: 'fail', detail: `Token expirado em ${connection.tokenExpiresAt.toISOString()}.` }],
    });
  }

  if (!input.webhookSubscriptionComplete) {
    return healthResult({
      now,
      state: 'action_required',
      label: 'Webhook incompleto',
      summary: 'O vínculo existe, mas não há prova local da assinatura completa dos webhooks necessários.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: true,
      retryable: false,
      checks: [{ key: 'webhook_subscription', status: 'fail', detail: 'Reconecte o Instagram para refazer a assinatura segura dos webhooks.' }],
    });
  }

  const failedAudit = getRecentHealthFailure(input.latestHealthAudit, connection.connectedAt);
  if (failedAudit) {
    const temporary = failedAudit.state === 'provider_error';
    return healthResult({
      now,
      state: failedAudit.state,
      label: temporary ? 'Meta temporariamente indisponível' : 'Ação necessária',
      summary: temporary
        ? 'A última validação não pôde ser concluída por um erro temporário da Meta.'
        : 'A Meta rejeitou a autorização ou uma permissão necessária na última validação.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: !temporary,
      retryable: temporary,
      checks: [{ key: 'provider_validation', status: temporary ? 'warn' : 'fail', detail: `Última validação: ${failedAudit.reason}.` }],
    });
  }

  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() - now.getTime() <= EXPIRY_WARNING_MS) {
    return healthResult({
      now,
      state: 'degraded',
      label: 'Renovação recomendada',
      summary: 'A conexão funciona, mas a autorização do Instagram está próxima do vencimento.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: true,
      retryable: false,
      checks: [{ key: 'token', status: 'warn', detail: `Token vence em ${connection.tokenExpiresAt.toISOString()}.` }],
    });
  }

  if (isHealthStale(connection.lastValidatedAt, now)) {
    return healthResult({
      now,
      state: 'degraded',
      label: 'Validação recomendada',
      summary: 'A conexão está vinculada, mas a validação com a Meta está desatualizada.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: false,
      retryable: true,
      checks: [{ key: 'validation_freshness', status: 'warn', detail: 'Verifique a conexão para confirmar permissões e acesso.' }],
    });
  }

  return healthResult({
    now,
    state: 'healthy',
    label: 'Saudável',
    summary: 'Instagram conectado e com validação recente.',
    lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
    reconnectRecommended: false,
    retryable: true,
    checks: [
      { key: 'binding_status', status: 'pass', detail: 'Vínculo ativo.' },
      { key: 'webhook_subscription', status: 'pass', detail: 'Webhooks necessários registrados.' },
      { key: 'validation_freshness', status: 'pass', detail: 'Validação recente.' },
    ],
  });
}

async function hasCompleteWebhookSubscription(input: { tenantId: string; connectionId: string; connectedAt: Date }) {
  const audit = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: 'tenant_instagram_connection',
      entityId: input.connectionId,
      action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION,
      createdAt: { gte: input.connectedAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const metadata = jsonMetadata(audit?.metadata ?? null);
  const fields = Array.isArray(metadata.fields)
    ? metadata.fields.filter((field): field is string => typeof field === 'string')
    : [];
  return INSTAGRAM_WEBHOOK_FIELDS.every(field => fields.includes(field));
}

export async function getInstagramConnectionHealthForTenant(tenantId: string) {
  const [platformAvailable, connection] = await Promise.all([
    isPlatformInstagramLoginAvailable(),
    getActiveInstagramConnection(tenantId),
  ]);
  if (!connection) {
    return buildInstagramConnectionHealth({
      connection: null,
      platformAvailable,
      webhookSubscriptionComplete: false,
      latestHealthAudit: null,
    });
  }
  const [webhookSubscriptionComplete, latestHealthAudit] = await Promise.all([
    hasCompleteWebhookSubscription({ tenantId, connectionId: connection.id, connectedAt: connection.connectedAt }),
    getLatestConnectionHealthAudit({
      tenantId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
      connectedAt: connection.connectedAt,
    }),
  ]);
  return buildInstagramConnectionHealth({ connection, platformAvailable, webhookSubscriptionComplete, latestHealthAudit });
}

export async function validateInstagramConnectionHealth(input: { tenantId: string; userId: string }) {
  const connection = await prisma.tenantInstagramConnection.findFirst({
    where: { tenantId: input.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: {
      id: true,
      instagramUserId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
    },
  });
  if (!connection) return getInstagramConnectionHealthForTenant(input.tenantId);

  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) {
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
      state: 'expired',
      reason: 'token_expired',
    });
    return getInstagramConnectionHealthForTenant(input.tenantId);
  }

  let accessToken: string | null = null;
  try {
    accessToken = decryptIntegrationSecret(connection.accessTokenEncrypted);
  } catch {
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
      state: 'action_required',
      reason: 'credential_unreadable',
    });
    return getInstagramConnectionHealthForTenant(input.tenantId);
  }
  if (!accessToken) {
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
      state: 'action_required',
      reason: 'credential_missing',
    });
    return getInstagramConnectionHealthForTenant(input.tenantId);
  }

  try {
    const account = await validateInstagramProfessionalAccount({ accessToken });
    if (account.instagramUserId !== connection.instagramUserId) {
      const mismatch = new Error('Instagram account mismatch') as Error & { status?: number };
      mismatch.status = 403;
      throw mismatch;
    }
    const now = new Date();
    await prisma.$transaction(async tx => {
      await tx.tenantInstagramConnection.update({
        where: { id: connection.id },
        data: { username: account.username, lastValidatedAt: now },
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          entityType: 'tenant_instagram_connection',
          entityId: connection.id,
          action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
          metadata: {
            state: 'healthy',
            reason: 'provider_validated',
            checkedAt: now.toISOString(),
            instagramUserId: account.instagramUserId,
            username: account.username,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    const failure = classifyMetaConnectionProviderError(error);
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_CONNECTION_HEALTH_ACTION,
      ...failure,
    });
  }
  return getInstagramConnectionHealthForTenant(input.tenantId);
}
