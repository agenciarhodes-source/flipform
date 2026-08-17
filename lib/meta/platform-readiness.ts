import 'server-only';

import { getPlatformInstagramLoginCredentials, INSTAGRAM_OAUTH_CALLBACK_PATH } from './instagram-platform';
import { INSTAGRAM_GRAPH_VERSION } from './instagram';
import { getPlatformInstagramWebhookCredentials, getInstagramWebhookVerifyToken } from './instagram-runtime-credentials';
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
  graphApiVersions: {
    meta: string;
    instagram: string;
  };
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

function passFailCheck(input: {
  key: string;
  label: string;
  ok: boolean;
  passDetail: string;
  failDetail: string;
  blocking?: boolean;
}): MetaReadinessCheck {
  return {
    key: input.key,
    label: input.label,
    status: input.ok ? 'pass' : 'fail',
    detail: input.ok ? input.passDetail : input.failDetail,
    blocking: input.blocking ?? true,
  };
}

function component(input: {
  key: MetaReadinessComponent['key'];
  label: string;
  readySummary: string;
  actionSummary: string;
  checks: MetaReadinessCheck[];
}): MetaReadinessComponent {
  const ready = input.checks.every(check => !check.blocking || check.status === 'pass');
  return {
    key: input.key,
    label: input.label,
    status: ready ? 'ready' : 'action_required',
    summary: ready ? input.readySummary : input.actionSummary,
    checks: input.checks,
  };
}

export function buildMetaPlatformReadiness(
  settings: AdminSettings,
  probes: LocalCredentialProbes,
  environment: ReadinessEnvironment,
  now = new Date(),
): MetaPlatformReadiness {
  const baseUrl = normalizedAppBaseUrl(environment.appUrl);
  const publicAppUrlReady = appUrlReady(baseUrl, environment.nodeEnv);

  const base = component({
    key: 'base',
    label: 'Base Meta da plataforma',
    readySummary: 'Credenciais centrais legíveis e URL pública preparada.',
    actionSummary: 'A configuração central da Meta ainda possui pendências.',
    checks: [
      passFailCheck({
        key: 'meta_app_id',
        label: 'Meta App ID',
        ok: present(settings.appId),
        passDetail: 'App ID configurado no Admin.',
        failDetail: 'Configure o Meta App ID no Admin.',
      }),
      passFailCheck({
        key: 'meta_app_secret',
        label: 'Meta App Secret',
        ok: Boolean(settings.appSecretConfigured && probes.metaOAuthReadable),
        passDetail: 'App Secret criptografado e legível pelo backend.',
        failDetail: 'Configure novamente o App Secret ou valide a chave de criptografia da plataforma.',
      }),
      passFailCheck({
        key: 'public_app_url',
        label: 'URL pública do FlipForm',
        ok: publicAppUrlReady,
        passDetail: `URL base válida para callbacks: ${baseUrl}.`,
        failDetail: environment.nodeEnv === 'production'
          ? 'NEXT_PUBLIC_APP_URL deve apontar para uma URL HTTPS pública em produção.'
          : 'Configure NEXT_PUBLIC_APP_URL com uma URL HTTP/HTTPS válida.',
      }),
    ],
  });

  const ads = component({
    key: 'ads',
    label: 'Ads / Facebook Login for Business',
    readySummary: 'O onboarding de Ads está preparado internamente.',
    actionSummary: 'O onboarding de Ads ainda não pode ser liberado.',
    checks: [
      passFailCheck({
        key: 'business_login_config_id',
        label: 'Configuration ID',
        ok: present(settings.businessLoginConfigId),
        passDetail: 'Configuration ID de Ads configurado.',
        failDetail: 'Configure o Facebook Login for Business Configuration ID.',
      }),
      passFailCheck({
        key: 'ads_callback',
        label: 'OAuth callback',
        ok: publicAppUrlReady && typeof settings.redirectUri === 'string' && settings.redirectUri.startsWith(`${baseUrl || ''}/`),
        passDetail: settings.redirectUri || 'Callback configurado.',
        failDetail: 'O callback de Ads não está consistente com a URL pública da plataforma.',
      }),
      passFailCheck({
        key: 'ads_credentials_readable',
        label: 'Credenciais de runtime',
        ok: probes.metaOAuthReadable && present(settings.businessLoginConfigId),
        passDetail: 'O backend consegue carregar as credenciais necessárias para iniciar o OAuth.',
        failDetail: 'As credenciais de Ads não estão utilizáveis pelo backend.',
      }),
    ],
  });

  const instagram = component({
    key: 'instagram',
    label: 'Instagram Business Login',
    readySummary: 'O Business Login do Instagram está preparado internamente.',
    actionSummary: 'O Business Login do Instagram possui pendências.',
    checks: [
      passFailCheck({
        key: 'instagram_app_id',
        label: 'Instagram App ID',
        ok: present(settings.instagramAppId),
        passDetail: 'Instagram App ID configurado.',
        failDetail: 'Configure o Instagram App ID no Admin.',
      }),
      passFailCheck({
        key: 'instagram_app_secret',
        label: 'Instagram App Secret',
        ok: Boolean(settings.instagramAppSecretConfigured && probes.instagramLoginReadable),
        passDetail: 'Instagram App Secret criptografado e legível pelo backend.',
        failDetail: 'Configure novamente o Instagram App Secret ou valide a criptografia da plataforma.',
      }),
      passFailCheck({
        key: 'instagram_callback',
        label: 'OAuth callback',
        ok: publicAppUrlReady,
        passDetail: endpoint(baseUrl, INSTAGRAM_OAUTH_CALLBACK_PATH),
        failDetail: 'A URL pública precisa estar válida antes de cadastrar o callback do Instagram.',
      }),
    ],
  });

  const instagramWebhook = component({
    key: 'instagram_webhook',
    label: 'Instagram Webhook',
    readySummary: 'Endpoint, assinatura e verificação estão preparados.',
    actionSummary: 'O webhook do Instagram ainda possui pendências de plataforma.',
    checks: [
      passFailCheck({
        key: 'instagram_webhook_secret',
        label: 'Assinatura do webhook',
        ok: probes.instagramWebhookSecretReadable,
        passDetail: 'O backend consegue carregar o App Secret usado para validar X-Hub-Signature-256.',
        failDetail: 'O App Secret do Instagram não está disponível para validar assinaturas.',
      }),
      passFailCheck({
        key: 'instagram_webhook_verify_token',
        label: 'Verify Token',
        ok: environment.instagramWebhookVerifyTokenConfigured,
        passDetail: 'Verify Token configurado no ambiente sem exposição ao navegador.',
        failDetail: 'Configure META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN no ambiente da aplicação.',
      }),
      passFailCheck({
        key: 'instagram_webhook_url',
        label: 'Callback URL',
        ok: publicAppUrlReady,
        passDetail: endpoint(baseUrl, META_INSTAGRAM_WEBHOOK_PATH),
        failDetail: 'A URL pública precisa estar válida para cadastrar o webhook na Meta.',
      }),
    ],
  });

  const whatsapp = component({
    key: 'whatsapp',
    label: 'WhatsApp Embedded Signup',
    readySummary: 'Embedded Signup e runtime estão preparados internamente.',
    actionSummary: 'O WhatsApp ainda possui pendências de configuração da plataforma.',
    checks: [
      passFailCheck({
        key: 'whatsapp_config_id',
        label: 'Embedded Signup Configuration ID',
        ok: present(settings.whatsappEmbeddedSignupConfigId),
        passDetail: 'Configuration ID configurado.',
        failDetail: 'Configure o Configuration ID do WhatsApp Embedded Signup.',
      }),
      passFailCheck({
        key: 'whatsapp_business_id',
        label: 'Business ID da plataforma',
        ok: present(settings.whatsappBusinessId),
        passDetail: 'Business ID da plataforma configurado.',
        failDetail: 'Configure o Business ID da plataforma.',
      }),
      passFailCheck({
        key: 'whatsapp_system_user',
        label: 'System User do FlipForm',
        ok: present(settings.whatsappSystemUserId),
        passDetail: 'System User ID configurado.',
        failDetail: 'Configure o System User ID usado pela plataforma.',
      }),
      passFailCheck({
        key: 'whatsapp_admin_runtime',
        label: 'Credenciais administrativas',
        ok: Boolean(settings.whatsappAdminSystemUserAccessTokenConfigured && probes.whatsappEmbeddedSignupReadable),
        passDetail: 'Token administrativo criptografado e legível para atribuição do System User.',
        failDetail: 'O token administrativo do WhatsApp não está utilizável pelo backend.',
      }),
      passFailCheck({
        key: 'whatsapp_runtime',
        label: 'Credencial de runtime',
        ok: Boolean(settings.whatsappSystemUserAccessTokenConfigured && probes.whatsappRuntimeReadable),
        passDetail: 'System User token de runtime criptografado e legível.',
        failDetail: 'O System User token de runtime não está utilizável pelo backend.',
      }),
    ],
  });

  const whatsappWebhook = component({
    key: 'whatsapp_webhook',
    label: 'WhatsApp Webhook',
    readySummary: 'Endpoint, assinatura e verificação estão preparados.',
    actionSummary: 'O webhook do WhatsApp ainda possui pendências de plataforma.',
    checks: [
      passFailCheck({
        key: 'whatsapp_webhook_secret',
        label: 'Assinatura do webhook',
        ok: probes.whatsappWebhookSecretReadable,
        passDetail: 'O backend consegue carregar o App Secret usado para validar X-Hub-Signature-256.',
        failDetail: 'O App Secret da Meta não está disponível para validar assinaturas do WhatsApp.',
      }),
      passFailCheck({
        key: 'whatsapp_webhook_verify_token',
        label: 'Verify Token',
        ok: environment.whatsappWebhookVerifyTokenConfigured,
        passDetail: 'Verify Token configurado no ambiente sem exposição ao navegador.',
        failDetail: 'Configure META_WHATSAPP_WEBHOOK_VERIFY_TOKEN no ambiente da aplicação.',
      }),
      passFailCheck({
        key: 'whatsapp_webhook_url',
        label: 'Callback URL',
        ok: publicAppUrlReady,
        passDetail: endpoint(baseUrl, META_WHATSAPP_WEBHOOK_PATH),
        failDetail: 'A URL pública precisa estar válida para cadastrar o webhook na Meta.',
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
    graphApiVersions: {
      meta: META_PLATFORM_GRAPH_API_VERSION,
      instagram: INSTAGRAM_GRAPH_VERSION,
    },
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
  const [
    settings,
    metaOAuthCredentials,
    instagramLoginCredentials,
    instagramWebhookCredentials,
    whatsappEmbeddedSignupCredentials,
    whatsappRuntimeCredentials,
    whatsappWebhookCredentials,
  ] = await Promise.all([
    getPlatformMetaSettingsForAdmin(),
    getPlatformMetaOAuthCredentials(),
    getPlatformInstagramLoginCredentials(),
    getPlatformInstagramWebhookCredentials(),
    getPlatformWhatsAppEmbeddedSignupCredentials(),
    getPlatformWhatsAppRuntimeCredentials(),
    getPlatformWhatsAppWebhookCredentials(),
  ]);

  return buildMetaPlatformReadiness(
    settings,
    {
      metaOAuthReadable: Boolean(metaOAuthCredentials),
      instagramLoginReadable: Boolean(instagramLoginCredentials),
      instagramWebhookSecretReadable: Boolean(instagramWebhookCredentials),
      whatsappEmbeddedSignupReadable: Boolean(whatsappEmbeddedSignupCredentials),
      whatsappRuntimeReadable: Boolean(whatsappRuntimeCredentials),
      whatsappWebhookSecretReadable: Boolean(whatsappWebhookCredentials),
    },
    {
      nodeEnv: process.env.NODE_ENV,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      instagramWebhookVerifyTokenConfigured: Boolean(getInstagramWebhookVerifyToken()),
      whatsappWebhookVerifyTokenConfigured: Boolean(getWhatsAppWebhookVerifyToken()),
    },
  );
}
