import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getPlatformWhatsAppRuntimeCredentials,
  isPlatformWhatsAppEmbeddedSignupAvailable,
  isPlatformWhatsAppRuntimeAvailable,
} from './platform-settings';
import {
  validateWhatsAppSystemUserToken,
  validateWhatsAppWabaPhoneSelection,
} from './whatsapp';
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

export const WHATSAPP_CONNECTION_HEALTH_ACTION = 'WHATSAPP_CONNECTION_HEALTH_CHECKED';
const WHATSAPP_PHONE_REGISTERED_ACTION = 'WHATSAPP_PHONE_REGISTERED';

type WhatsAppHealthConnection = {
  id: string;
  status: string;
  phoneNumberId: string;
  connectedAt: Date;
  systemUserAssignedAt: Date | null;
  subscribedAt: Date | null;
  lastValidatedAt: Date | null;
};

export function buildWhatsAppConnectionHealth(input: {
  connection: WhatsAppHealthConnection | null;
  platformAvailable: boolean;
  runtimeAvailable: boolean;
  registeredAt: Date | null;
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
      summary: 'Nenhum número do WhatsApp está conectado a esta empresa.',
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

  if (!input.platformAvailable || !input.runtimeAvailable) {
    return healthResult({
      now,
      state: 'action_required',
      label: 'Configuração da plataforma pendente',
      summary: 'O Super Admin precisa corrigir as credenciais universais do WhatsApp antes de operar este número.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: false,
      retryable: false,
      checks: [{ key: 'platform', status: 'fail', detail: 'Embedded Signup ou credencial de runtime indisponível.' }],
    });
  }

  if (!connection.systemUserAssignedAt || !connection.subscribedAt) {
    return healthResult({
      now,
      state: 'action_required',
      label: 'Ativação incompleta',
      summary: 'O vínculo existe, mas a atribuição do System User ou a assinatura do WABA está incompleta.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: true,
      retryable: false,
      checks: [
        { key: 'system_user_assignment', status: connection.systemUserAssignedAt ? 'pass' : 'fail', detail: connection.systemUserAssignedAt ? 'System User atribuído.' : 'System User não confirmado.' },
        { key: 'waba_subscription', status: connection.subscribedAt ? 'pass' : 'fail', detail: connection.subscribedAt ? 'WABA assinado.' : 'Assinatura do WABA não confirmada.' },
      ],
    });
  }

  if (!input.registeredAt) {
    return healthResult({
      now,
      state: 'action_required',
      label: 'Registro do número pendente',
      summary: 'A conta foi conectada, mas o número ainda precisa ser registrado na Cloud API com o PIN de 6 dígitos.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: false,
      retryable: false,
      checks: [{ key: 'phone_registration', status: 'fail', detail: 'Conclua o registro do número na Cloud API.' }],
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
        ? 'A última validação do WhatsApp falhou por um erro temporário da Meta.'
        : 'A última validação detectou perda de acesso ao WABA, número ou permissões.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: !temporary,
      retryable: temporary,
      checks: [{ key: 'provider_validation', status: temporary ? 'warn' : 'fail', detail: `Última validação: ${failedAudit.reason}.` }],
    });
  }

  if (isHealthStale(connection.lastValidatedAt, now)) {
    return healthResult({
      now,
      state: 'degraded',
      label: 'Validação recomendada',
      summary: 'O número está conectado, mas a validação com a Meta está desatualizada.',
      lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
      reconnectRecommended: false,
      retryable: true,
      checks: [{ key: 'validation_freshness', status: 'warn', detail: 'Verifique a conexão para confirmar acesso ao WABA e ao número.' }],
    });
  }

  return healthResult({
    now,
    state: 'healthy',
    label: 'Saudável',
    summary: 'WhatsApp conectado, registrado e com validação recente.',
    lastValidatedAt: connection.lastValidatedAt?.toISOString() || null,
    reconnectRecommended: false,
    retryable: true,
    checks: [
      { key: 'system_user_assignment', status: 'pass', detail: 'System User atribuído no onboarding.' },
      { key: 'waba_subscription', status: 'pass', detail: 'Assinatura do WABA registrada.' },
      { key: 'phone_registration', status: 'pass', detail: 'Registro do número confirmado no FlipForm.' },
      { key: 'validation_freshness', status: 'pass', detail: 'Validação recente.' },
    ],
  });
}

export async function getWhatsAppRegisteredAt(input: {
  tenantId: string;
  connectionId: string;
  phoneNumberId: string;
  connectedAt: Date;
}) {
  const audits = await prisma.auditLog.findMany({
    where: {
      tenantId: input.tenantId,
      entityType: 'tenant_whatsapp_connection',
      entityId: input.connectionId,
      action: WHATSAPP_PHONE_REGISTERED_ACTION,
      createdAt: { gte: input.connectedAt },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, metadata: true },
  });
  const bindingConnectedAt = input.connectedAt.toISOString();
  const registration = audits.find(item => {
    const metadata = jsonMetadata(item.metadata);
    return metadata.phoneNumberId === input.phoneNumberId
      && metadata.bindingConnectedAt === bindingConnectedAt;
  });
  return registration?.createdAt || null;
}

export async function getWhatsAppConnectionHealthForTenant(tenantId: string) {
  const [platformAvailable, runtimeAvailable, connection] = await Promise.all([
    isPlatformWhatsAppEmbeddedSignupAvailable(),
    isPlatformWhatsAppRuntimeAvailable(),
    prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        status: true,
        phoneNumberId: true,
        connectedAt: true,
        systemUserAssignedAt: true,
        subscribedAt: true,
        lastValidatedAt: true,
      },
    }),
  ]);
  if (!connection) {
    return buildWhatsAppConnectionHealth({
      connection: null,
      platformAvailable,
      runtimeAvailable,
      registeredAt: null,
      latestHealthAudit: null,
    });
  }
  const [registeredAt, latestHealthAudit] = await Promise.all([
    connection.status === 'connected'
      ? getWhatsAppRegisteredAt({ tenantId, connectionId: connection.id, phoneNumberId: connection.phoneNumberId, connectedAt: connection.connectedAt })
      : Promise.resolve(null),
    getLatestConnectionHealthAudit({
      tenantId,
      entityType: 'tenant_whatsapp_connection',
      entityId: connection.id,
      action: WHATSAPP_CONNECTION_HEALTH_ACTION,
      connectedAt: connection.connectedAt,
    }),
  ]);
  return buildWhatsAppConnectionHealth({ connection, platformAvailable, runtimeAvailable, registeredAt, latestHealthAudit });
}

export async function validateWhatsAppConnectionHealth(input: { tenantId: string; userId: string }) {
  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId: input.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true, wabaId: true, phoneNumberId: true },
  });
  if (!connection) return getWhatsAppConnectionHealthForTenant(input.tenantId);

  let credentials: Awaited<ReturnType<typeof getPlatformWhatsAppRuntimeCredentials>> = null;
  try {
    credentials = await getPlatformWhatsAppRuntimeCredentials();
  } catch {
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_whatsapp_connection',
      entityId: connection.id,
      action: WHATSAPP_CONNECTION_HEALTH_ACTION,
      state: 'action_required',
      reason: 'platform_credential_unreadable',
    });
    return getWhatsAppConnectionHealthForTenant(input.tenantId);
  }
  if (!credentials) {
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_whatsapp_connection',
      entityId: connection.id,
      action: WHATSAPP_CONNECTION_HEALTH_ACTION,
      state: 'action_required',
      reason: 'platform_runtime_unavailable',
    });
    return getWhatsAppConnectionHealthForTenant(input.tenantId);
  }

  try {
    await validateWhatsAppSystemUserToken({
      accessToken: credentials.systemUserAccessToken,
      debugAccessToken: credentials.systemUserAccessToken,
      appId: credentials.appId,
      wabaId: connection.wabaId,
    });
    const selection = await validateWhatsAppWabaPhoneSelection({
      accessToken: credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
    });
    const now = new Date();
    await prisma.$transaction(async tx => {
      await tx.tenantWhatsAppConnection.update({
        where: { id: connection.id },
        data: {
          wabaName: selection.waba.name,
          displayPhoneNumber: selection.phone.displayPhoneNumber,
          verifiedName: selection.phone.verifiedName,
          qualityRating: selection.phone.qualityRating,
          lastValidatedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          entityType: 'tenant_whatsapp_connection',
          entityId: connection.id,
          action: WHATSAPP_CONNECTION_HEALTH_ACTION,
          metadata: {
            state: 'healthy',
            reason: 'provider_validated',
            checkedAt: now.toISOString(),
            wabaId: selection.waba.id,
            phoneNumberId: selection.phone.id,
            qualityRating: selection.phone.qualityRating,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    const failure = classifyMetaConnectionProviderError(error);
    await writeConnectionHealthAudit({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'tenant_whatsapp_connection',
      entityId: connection.id,
      action: WHATSAPP_CONNECTION_HEALTH_ACTION,
      ...failure,
    });
  }
  return getWhatsAppConnectionHealthForTenant(input.tenantId);
}
