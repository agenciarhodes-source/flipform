import 'server-only';

import { INSTAGRAM_GRAPH_VERSION } from './instagram';
import { getPlatformInstagramLoginCredentials, INSTAGRAM_OAUTH_CALLBACK_PATH } from './instagram-platform';
import { getInstagramWebhookVerifyToken, getPlatformInstagramWebhookCredentials } from './instagram-runtime-credentials';
import { META_PLATFORM_GRAPH_API_VERSION } from './oauth';
import {
  getPlatformMetaOAuthCredentials,
  getPlatformMetaSettingsForAdmin,
  getPlatformWhatsAppEmbeddedSignupCredentials,
  getPlatformWhatsAppRuntimeCredentials,
} from './platform-settings';
import { getPlatformWhatsAppWebhookCredentials, getWhatsAppWebhookVerifyToken } from './whatsapp-runtime-credentials';

export const META_INSTAGRAM_WEBHOOK_PATH = '/api/webhooks/meta/instagram';
export const META_WHATSAPP_WEBHOOK_PATH = '/api/webhooks/meta/whatsapp';

export type MetaReadinessCheckStatus = 'pass' | 'fail' | 'manual';
export type MetaReadinessComponentStatus = 'ready' | 'action_required';
export type MetaPlatformReadinessStatus = 'ready_for_external_validation' | 'action_required';

export type MetaReadinessCheck = {
  key: string;
  label: string;
  status: MetaReadinessCheckStatus;
  detail: string;
  blocking: boolean;
};

export type MetaReadinessComponent = {
  key: 'base' | 'ads' | 'instagram' | 'instagram_webhook' | 'whatsapp' | 'whatsapp_webhook';
  label: string;
  status: MetaReadinessComponentStatus;
  summary: string;
  checks: MetaReadinessCheck[];
};

export type MetaPlatformReadiness = {
  status: MetaPlatformReadinessStatus;
  summary: string;
  graphApiVersions: { meta: string; instagram: string };
  endpoints: {
    adsOAuthCallback: string;
    instagramOAuthCallback: string;
    instagramWebhook: string;
    whatsappWebhook: string;
  };
  components: MetaReadinessComponent[];
  releaseGates: Array<{
    key: string;
    label: string;
    status: 'manual';
    detail: string;
  }>;
  generatedAt: string;
};

type AdminSettings = Awaited<ReturnType<typeof getPlatformMetaSettingsForAdmin>>;

type LocalCredentialProbes = {
  metaOAuthReadable: boolean;
  instagramLoginReadable: boolean;
  instagramWebhookSecretReadable: boolean;
  whatsappEmbeddedSignupReadable: boolean;
  whatsappRuntimeReadable: boolean;
  whatsappWebhookSecretReadable: boolean;
};

type ReadinessEnvironment = {
  nodeEnv?: string;
  appUrl?: string;
  instagramWebhookVerifyTokenConfigured: boolean;
  whatsappWebhookVerifyTokenConfigured: boolean;
};

function present(value: unknown) {
  return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value);
}

function endpoint(baseUrl: string | null, path: string) {
  return baseUrl ? `${baseUrl}${path}` : path;
}

function normalizedAppBaseUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function appUrlReady(baseUrl: string | null, nodeEnv: string | undefined) {
  if (!baseUrl) return false;
  const url = new URL(baseUrl);
  if (nodeEnv !== 'production') return ['http:', 'https:'].includes(url.protocol);
  return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function check(input: {
  key: string;
  label: string;
  ok: boolean;
  pass: string;
  fail: string;
  blocking?: boolean;
}): MetaReadinessCheck {
  return {
    key: input.key,
    label: input.label,
    status: input.ok ? 'pass' : 'fail',
    detail: input.ok ? input.pass : input.fail,
    blocking: input.blocking ?? true,
  };
}

function component(input: {
  key: MetaReadinessComponent['key'];
  label: string;
  ready: string;
  action: string;
  checks: MetaReadinessCheck[];
}): MetaReadinessComponent {
  const isReady = input.checks.every(item => !item.blocking || item.status === 'pass');
  return {
    key: input.key,
    label: input.label,
    status: isReady ? 'ready' : 'action_required',
    summary: isReady ? input.ready : input.action,
    checks: input.checks,
  };
}

/**
 * Readiness must diagnose broken encryption/configuration instead of becoming
 * unavailable itself. Credential loaders may throw when an encrypted secret can
 * no longer be decrypted, so each probe is isolated and fails closed to false.
 */
export async function probeCredentialReadability(loader: () => Promise<unknown>) {
  try {
    return Boolean(await loader());
  } catch {
    return false;
  }
}

export function buildMetaPlatformReadiness(
  settings: AdminSettings,
  probes: LocalCredentialProbes,
  environment: ReadinessEnvironment,
  now = new Date(),
): MetaPlatformReadiness {
  const baseUrl = normalizedAppBaseUrl(environment.appUrl);
  const publicUrlReady = appUrlReady(baseUrl, environment.nodeEnv);

  const base = component({
    key: 'base',
    label: 'Base Meta da plataforma',
    ready: 'Credenciais centrais legíveis e URL pública preparada.',
    action: 'A configuração central da Meta ainda possui pendências.',
    checks: [
      check({
        key: 'meta_app_id', label: 'Meta App ID', ok: present(settings.appId),
        pass: 'App ID configurado no Admin.', fail: 'Configure o Meta App ID no Admin.',
      }),
      check({
        key: 'meta_app_secret', label: 'Meta App Secret',
        ok: Boolean(settings.appSecretConfigured && probes.metaOAuthReadable),
        pass: 'App Secret criptografado e legível pelo backend.',
        fail: 'Configure novamente o App Secret ou valide a chave de criptografia da plataforma.',
      }),
      check({
        key: 'public_app_url', label: 'URL pública do FlipForm', ok: publicUrlReady,
        pass: `URL base válida para callbacks: ${baseUrl}.`,
        fail: environment.nodeEnv === 'production'
          ? 'NEXT_PUBLIC_APP_URL deve apontar para uma URL HTTPS pública em produção.'
          : 'Configure NEXT_PUBLIC_APP_URL com uma URL HTTP/HTTPS válida.',
      }),
    ],
  });

  const ads = component({
    key: 'ads',
    label: 'Ads / Facebook Login for Business',
    ready: 'O onboarding de Ads está preparado internamente.',
    action: 'O onboarding de Ads ainda não pode ser liberado.',
    checks: [
      check({
        key: 'business_login_config_id', label: 'Configuration ID', ok: present(settings.businessLoginConfigId),
        pass: 'Configuration ID de Ads configurado.', fail: 'Configure o Facebook Login for Business Configuration ID.',
      }),
      check({
        key: 'ads_callback', label: 'OAuth callback',
        ok: publicUrlReady && typeof settings.redirectUri === 'string' && settings.redirectUri.startsWith(`${baseUrl || ''}/`),
        pass: settings.redirectUri || 'Callback configurado.',
        fail: 'O callback de Ads não está consistente com a URL pública da plataforma.',
      }),
      check({
        key: 'ads_credentials_readable', label: 'Credenciais de runtime',
        ok: probes.metaOAuthReadable && present(settings.businessLoginConfigId),
        pass: 'O backend consegue carregar as credenciais necessárias para iniciar o OAuth.',
        fail: 'As credenciais de Ads não estão utilizáveis pelo backend.',
      }),
    ],
  });

  const instagram = component({
    key: 'instagram',
    label: 'Instagram Business Login',
    ready: 'O Business Login do Instagram está preparado internamente.',
    action: 'O Business Login do Instagram possui pendências.',
    checks: [
      check({
        key: 'instagram_app_id', label: 'Instagram App ID', ok: present(settings.instagramAppId),
        pass: 'Instagram App ID configurado.', fail: 'Configure o Instagram App ID no Admin.',
      }),
      check({
        key: 'instagram_app_secret', label: 'Instagram App Secret',
        ok: Boolean(settings.instagramAppSecretConfigured && probes.instagramLoginReadable),
        pass: 'Instagram App Secret criptografado e legível pelo backend.',
        fail: 'Configure novamente o Instagram App Secret ou valide a criptografia da plataforma.',
      }),
      check({
        key: 'instagram_callback', label: 'OAuth callback', ok: publicUrlReady,
        pass: endpoint(baseUrl, INSTAGRAM_OAUTH_CALLBACK_PATH),
        fail: 'A URL pública precisa estar válida antes de cadastrar o callback do Instagram.',
      }),
    ],
  });

  const instagramWebhook = component({
    key: 'instagram_webhook',
    label: 'Instagram Webhook',
    ready: 'Endpoint, assinatura e verificação estão preparados.',
    action: 'O webhook do Instagram ainda possui pendências de plataforma.',
    checks: [
      check({
        key: 'instagram_webhook_secret', label: 'Assinatura do webhook', ok: probes.instagramWebhookSecretReadable,
        pass: 'O backend consegue carregar o App Secret usado para validar X-Hub-Signature-256.',
        fail: 'O App Secret do Instagram não está disponível para validar assinaturas.',
      }),
      check({
        key: 'instagram_webhook_verify_token', label: 'Verify Token',
        ok: environment.instagramWebhookVerifyTokenConfigured,
        pass: 'Verify Token configurado no ambiente sem exposição ao navegador.',
        fail: 'Configure META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN no ambiente da aplicação.',
      }),
      check({
        key: 'instagram_webhook_url', label: 'Callback URL', ok: publicUrlReady,
        pass: endpoint(baseUrl, META_INSTAGRAM_WEBHOOK_PATH),
        fail: 'A URL pública precisa estar válida para cadastrar o webhook na Meta.',
      }),
    ],
  });

  const whatsapp = component({
    key: 'whatsapp',
    label: 'WhatsApp Embedded Signup',
    ready: 'Embedded Signup e runtime estão preparados internamente.',
    action: 'O WhatsApp ainda possui pendências de configuração da plataforma.',
    checks: [
      check({
        key: 'whatsapp_config_id', label: 'Embedded Signup Configuration ID', ok: present(settings.whatsappEmbeddedSignupConfigId),
        pass: 'Configuration ID configurado.', fail: 'Configure o Configuration ID do WhatsApp Embedded Signup.',
      }),
      check({
        key: 'whatsapp_business_id', label: 'Business ID da plataforma', ok: present(settings.whatsappBusinessId),
        pass: 'Business ID da plataforma configurado.', fail: 'Configure o Business ID da plataforma.',
      }),
      check({
        key: 'whatsapp_system_user', label: 'System User do FlipForm', ok: present(settings.whatsappSystemUserId),
        pass: 'System User ID configurado.', fail: 'Configure o System User ID usado pela plataforma.',
      }),
      check({
        key: 'whatsapp_admin_runtime', label: 'Credenciais administrativas',
        ok: Boolean(settings.whatsappAdminSystemUserAccessTokenConfigured && probes.whatsappEmbeddedSignupReadable),
        pass: 'Token administrativo criptografado e legível para atribuição do System User.',
        fail: 'O token administrativo do WhatsApp não está utilizável pelo backend.',
      }),
      check({
        key: 'whatsapp_runtime', label: 'Credencial de runtime',
        ok: Boolean(settings.whatsappSystemUserAccessTokenConfigured && probes.whatsappRuntimeReadable),
        pass: 'System User token de runtime criptografado e legível.',
        fail: 'O System User token de runtime não está utilizável pelo backend.',
      }),
    ],
  });

  const whatsappWebhook = component({
    key: 'whatsapp_webhook',
    label: 'WhatsApp Webhook',
    ready: 'Endpoint, assinatura e verificação estão preparados.',
    action: 'O webhook do WhatsApp ainda possui pendências de plataforma.',
    checks: [
      check({
        key: 'whatsapp_webhook_secret', label: 'Assinatura do webhook', ok: probes.whatsappWebhookSecretReadable,
        pass: 'O backend consegue carregar o App Secret usado para validar X-Hub-Signature-256.',
        fail: 'O App Secret da Meta não está disponível para validar assinaturas do WhatsApp.',
      }),
      check({
        key: 'whatsapp_webhook_verify_token', label: 'Verify Token',
        ok: environment.whatsappWebhookVerifyTokenConfigured,
        pass: 'Verify Token configurado no ambiente sem exposição ao navegador.',
        fail: 'Configure META_WHATSAPP_WEBHOOK_VERIFY_TOKEN no ambiente da aplicação.',
      }),
      check({
        key: 'whatsapp_webhook_url', label: 'Callback URL', ok: publicUrlReady,
        pass: endpoint(baseUrl, META_WHATSAPP_WEBHOOK_PATH),
        fail: 'A URL pública precisa estar válida para cadastrar o webhook na Meta.',
      }),
    ],
  });

  const components = [base, ads, instagram, instagramWebhook, whatsapp, whatsappWebhook];
  const internallyReady = components.every(item => item.status === 'ready');

  return {
    status: internallyReady ? 'ready_for_external_validation' : 'action_required',
    summary: internallyReady
      ? 'A configuração interna do FlipForm está pronta. Os gates externos da Meta ainda devem ser confirmados antes da liberação ampla para clientes.'
      : 'Existem pendências internas que devem ser resolvidas antes de liberar novas conexões Meta.',
    graphApiVersions: { meta: META_PLATFORM_GRAPH_API_VERSION, instagram: INSTAGRAM_GRAPH_VERSION },
    endpoints: {
      adsOAuthCallback: settings.redirectUri,
      instagramOAuthCallback: endpoint(baseUrl, INSTAGRAM_OAUTH_CALLBACK_PATH),
      instagramWebhook: endpoint(baseUrl, META_INSTAGRAM_WEBHOOK_PATH),
      whatsappWebhook: endpoint(baseUrl, META_WHATSAPP_WEBHOOK_PATH),
    },
    components,
    releaseGates: [
      {
        key: 'meta_app_review',
        label: 'App Review / Advanced Access',
        status: 'manual',
        detail: 'Confirme no painel da Meta que as permissões necessárias para Ads, Instagram e WhatsApp estão aprovadas para uso com contas de clientes.',
      },
      {
        key: 'meta_business_verification',
        label: 'Business Verification / Tech Provider',
        status: 'manual',
        detail: 'Confirme no painel da Meta os requisitos aplicáveis à empresa e ao fluxo de WhatsApp Embedded Signup antes do rollout comercial.',
      },
      {
        key: 'meta_live_mode',
        label: 'Aplicativo em modo adequado para produção',
        status: 'manual',
        detail: 'Confirme na Meta que o aplicativo e os produtos usados estão liberados para contas externas conforme o estágio de produção.',
      },
    ],
    generatedAt: now.toISOString(),
  };
}

export async function getMetaPlatformReadinessForAdmin() {
  const settings = await getPlatformMetaSettingsForAdmin();
  const [
    metaOAuthReadable,
    instagramLoginReadable,
    instagramWebhookSecretReadable,
    whatsappEmbeddedSignupReadable,
    whatsappRuntimeReadable,
    whatsappWebhookSecretReadable,
  ] = await Promise.all([
    probeCredentialReadability(() => getPlatformMetaOAuthCredentials()),
    probeCredentialReadability(() => getPlatformInstagramLoginCredentials()),
    probeCredentialReadability(() => getPlatformInstagramWebhookCredentials()),
    probeCredentialReadability(() => getPlatformWhatsAppEmbeddedSignupCredentials()),
    probeCredentialReadability(() => getPlatformWhatsAppRuntimeCredentials()),
    probeCredentialReadability(() => getPlatformWhatsAppWebhookCredentials()),
  ]);

  return buildMetaPlatformReadiness(
    settings,
    {
      metaOAuthReadable,
      instagramLoginReadable,
      instagramWebhookSecretReadable,
      whatsappEmbeddedSignupReadable,
      whatsappRuntimeReadable,
      whatsappWebhookSecretReadable,
    },
    {
      nodeEnv: process.env.NODE_ENV,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      instagramWebhookVerifyTokenConfigured: Boolean(getInstagramWebhookVerifyToken()),
      whatsappWebhookVerifyTokenConfigured: Boolean(getWhatsAppWebhookVerifyToken()),
    },
  );
}
