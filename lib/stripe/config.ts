import 'server-only';

export const STRIPE_SDK_VERSION = '22.6.2' as const;
export const STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED = false as const;

export type StripeEnvironmentMode = 'test' | 'live';
export type StripeRestrictedKeyKind = 'missing' | 'test' | 'live' | 'invalid';

export type StripeFoundationReadiness = {
  enabled: boolean;
  mode: StripeEnvironmentMode;
  restrictedKeyConfigured: boolean;
  restrictedKeyKind: StripeRestrictedKeyKind;
  webhookSecretConfigured: boolean;
  webhookSecretLooksValid: boolean;
  testModeGuardActive: boolean;
  livePaymentsAllowed: boolean;
  readyForTestIntegration: boolean;
  errors: string[];
};

function parseBoolean(value: string | undefined) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function parseMode(value: string | undefined): StripeEnvironmentMode {
  return String(value || '').trim().toLowerCase() === 'live' ? 'live' : 'test';
}

function restrictedKeyKind(value: string | undefined): StripeRestrictedKeyKind {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('rk_test_')) return 'test';
  if (key.startsWith('rk_live_')) return 'live';
  return 'invalid';
}

function webhookSecretLooksValid(value: string | undefined) {
  const secret = String(value || '').trim();
  return secret.startsWith('whsec_') && secret.length >= 16;
}

export function inspectStripeFoundationConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): StripeFoundationReadiness {
  const enabled = parseBoolean(env.STRIPE_ENABLED);
  const mode = parseMode(env.STRIPE_MODE);
  const keyKind = restrictedKeyKind(env.STRIPE_RESTRICTED_KEY);
  const webhookConfigured = Boolean(String(env.STRIPE_WEBHOOK_SECRET || '').trim());
  const webhookValid = webhookSecretLooksValid(env.STRIPE_WEBHOOK_SECRET);
  const errors: string[] = [];

  if (enabled) {
    if (mode !== 'test') {
      errors.push('PR #331 mantém pagamentos Stripe live bloqueados por código.');
    }
    if (keyKind !== 'test') {
      errors.push('Use uma Restricted API Key de teste (rk_test_) nesta etapa.');
    }
    if (!webhookConfigured) {
      errors.push('STRIPE_WEBHOOK_SECRET ainda não foi configurado.');
    } else if (!webhookValid) {
      errors.push('STRIPE_WEBHOOK_SECRET não possui o formato esperado.');
    }
  }

  return {
    enabled,
    mode,
    restrictedKeyConfigured: keyKind !== 'missing',
    restrictedKeyKind: keyKind,
    webhookSecretConfigured: webhookConfigured,
    webhookSecretLooksValid: webhookValid,
    testModeGuardActive: true,
    livePaymentsAllowed: STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED,
    readyForTestIntegration: enabled
      && mode === 'test'
      && keyKind === 'test'
      && webhookValid
      && errors.length === 0,
    errors,
  };
}

export function requireStripeTestConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const readiness = inspectStripeFoundationConfiguration(env);
  if (!readiness.enabled) {
    throw new StripeFoundationConfigError(
      'STRIPE_DISABLED',
      'A integração Stripe está desativada.',
    );
  }
  if (readiness.mode !== 'test' || readiness.restrictedKeyKind !== 'test') {
    throw new StripeFoundationConfigError(
      'STRIPE_TEST_MODE_REQUIRED',
      'O PR #331 aceita somente Restricted API Key de teste.',
    );
  }
  if (!readiness.webhookSecretLooksValid) {
    throw new StripeFoundationConfigError(
      'STRIPE_WEBHOOK_SECRET_MISSING',
      'Configure o webhook secret de teste antes de habilitar a integração.',
    );
  }

  const restrictedKey = String(env.STRIPE_RESTRICTED_KEY || '').trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();

  return {
    mode: 'test' as const,
    restrictedKey,
    webhookSecret,
  };
}

export class StripeFoundationConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StripeFoundationConfigError';
  }
}
