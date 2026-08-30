import 'server-only';

import {
  getPlatformMetaSettingsForAdmin,
  getPlatformWhatsAppEmbeddedSignupCredentials,
} from './platform-settings';
import { verifyWhatsAppPlatformSystemUser } from './whatsapp';
import { validateWhatsAppPlatformRuntimeTokenForPreflight } from './whatsapp-platform-token-preflight';

export type WhatsAppPlatformPreflightCheck = {
  key: 'configuration' | 'admin_token' | 'runtime_token' | 'system_user';
  label: string;
  status: 'pass' | 'fail';
  detail: string;
};

export type WhatsAppPlatformPreflight = {
  status: 'ready' | 'action_required';
  summary: string;
  checks: WhatsAppPlatformPreflightCheck[];
  generatedAt: string;
};

function check(
  key: WhatsAppPlatformPreflightCheck['key'],
  label: string,
  ok: boolean,
  pass: string,
  fail: string,
): WhatsAppPlatformPreflightCheck {
  return { key, label, status: ok ? 'pass' : 'fail', detail: ok ? pass : fail };
}

async function probe(loader: () => Promise<unknown>) {
  try {
    return Boolean(await loader());
  } catch {
    return false;
  }
}

async function probeResult<T>(loader: () => Promise<T>) {
  try {
    return { ok: true as const, value: await loader() };
  } catch {
    return { ok: false as const, value: null };
  }
}

/**
 * Performs a read-only validation of the universal WhatsApp platform box.
 * It never reads or mutates tenants, WABAs from customers, leads, conversations,
 * campaigns or tracking data. No secret or provider identifier is returned.
 */
export async function getWhatsAppPlatformPreflightForAdmin(): Promise<WhatsAppPlatformPreflight> {
  const settings = await getPlatformMetaSettingsForAdmin();
  const credentials = await getPlatformWhatsAppEmbeddedSignupCredentials().catch(() => null);

  const configurationReady = Boolean(
    settings.baseConfigured
    && settings.whatsappEmbeddedSignupConfigured
    && credentials,
  );

  let adminTokenReady = false;
  let runtimeTokenReady = false;
  let systemUserReady = false;

  if (credentials) {
    // The administrative credential is validated against the exact read-only
    // Business capability FlipForm needs during onboarding. This is more
    // authoritative than relying on how /debug_token represents business scopes.
    const [adminCapability, runtimeReady] = await Promise.all([
      probeResult(() => verifyWhatsAppPlatformSystemUser({
        adminSystemUserAccessToken: credentials.adminSystemUserAccessToken,
        appSecret: credentials.appSecret,
        businessId: credentials.businessId,
        systemUserId: credentials.systemUserId,
      })),
      probe(() => validateWhatsAppPlatformRuntimeTokenForPreflight({
        accessToken: credentials.systemUserAccessToken,
        appId: credentials.appId,
        appSecret: credentials.appSecret,
      })),
    ]);

    adminTokenReady = adminCapability.ok;
    systemUserReady = adminCapability.ok && adminCapability.value === true;
    runtimeTokenReady = runtimeReady;
  }

  const checks = [
    check(
      'configuration',
      'Configuração universal salva',
      configurationReady,
      'App, Embedded Signup, Business, System User e credenciais universais estão disponíveis no backend.',
      'Complete os dados universais do WhatsApp no Super Admin antes de validar com a Meta.',
    ),
    check(
      'admin_token',
      'Token administrativo',
      adminTokenReady,
      'A credencial administrativa conseguiu consultar os System Users do Business do FlipForm.',
      'A credencial administrativa não conseguiu consultar os System Users do Business. Confirme business_management e o vínculo do app ao Business.',
    ),
    check(
      'runtime_token',
      'Token de runtime',
      runtimeTokenReady,
      'A Meta reconheceu o token de runtime com gerenciamento e mensageria do WhatsApp.',
      'O token de runtime não pôde ser validado com a Meta ou não possui os escopos necessários.',
    ),
    check(
      'system_user',
      'System User da plataforma',
      systemUserReady,
      'O System User configurado pertence ao Business do FlipForm e pode ser usado no onboarding automático.',
      adminTokenReady
        ? 'A consulta ao Business funcionou, mas o System User configurado não foi localizado nesse Business.'
        : 'O System User só pode ser confirmado depois que a credencial administrativa consultar o Business com sucesso.',
    ),
  ];

  const ready = checks.every(item => item.status === 'pass');
  return {
    status: ready ? 'ready' : 'action_required',
    summary: ready
      ? 'A caixa universal do WhatsApp está válida para iniciar testes de Embedded Signup com tenants controlados.'
      : 'A caixa universal ainda possui pendências antes de liberar o onboarding self-service para clientes.',
    checks,
    generatedAt: new Date().toISOString(),
  };
}
