import 'server-only';

import {
  getPlatformMetaSettingsForAdmin,
  getPlatformWhatsAppEmbeddedSignupCredentials,
} from './platform-settings';
import {
  validateWhatsAppPlatformAdminToken,
  validateWhatsAppPlatformRuntimeToken,
  verifyWhatsAppPlatformSystemUser,
} from './whatsapp';

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
    [adminTokenReady, runtimeTokenReady] = await Promise.all([
      probe(() => validateWhatsAppPlatformAdminToken({
        accessToken: credentials.adminSystemUserAccessToken,
        appId: credentials.appId,
      })),
      probe(() => validateWhatsAppPlatformRuntimeToken({
        accessToken: credentials.systemUserAccessToken,
        appId: credentials.appId,
      })),
    ]);

    if (adminTokenReady) {
      systemUserReady = await probe(() => verifyWhatsAppPlatformSystemUser({
        adminSystemUserAccessToken: credentials.adminSystemUserAccessToken,
        appSecret: credentials.appSecret,
        businessId: credentials.businessId,
        systemUserId: credentials.systemUserId,
      }));
    }
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
      'A Meta reconheceu o token administrativo do App FlipForm com o acesso necessário.',
      'O token administrativo não pôde ser validado com a Meta ou não possui o acesso esperado.',
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
      'O System User configurado não foi localizado no Business do FlipForm com a credencial administrativa informada.',
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
