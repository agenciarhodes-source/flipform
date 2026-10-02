import 'server-only';

export const STRIPE_SDK_VERSION = '22.6.2' as const;

export type StripeEnvironmentMode = 'test' | 'live';
export type StripeRestrictedKeyKind = 'missing' | 'test' | 'live' | 'invalid';

export type StripeFoundationReadiness = {
  enabled: boolean;
  mode: StripeEnvironmentMode;
  restrictedKeyConfigured: boolean;
  restrictedKeyKind: StripeRestrictedKeyKind;
  webhookSecretConfigured: boolean;
  webhookSecretLooksValid: boolean;
  environmentGuardActive: boolean;
  livePaymentsAllowed: boolean;
  readyForCheckout: boolean;
  readyForWebhookValidation: boolean;
  warnings: string[];
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
  const rawMode = String(env.STRIPE_MODE || 'test').trim().toLowerCase();
  const mode = parseMode(env.STRIPE_MODE);
  const keyKind = restrictedKeyKind(env.STRIPE_RESTRICTED_KEY);
  const webhookConfigured = Boolean(String(env.STRIPE_WEBHOOK_SECRET || '').trim());
  const webhookValid = webhookSecretLooksValid(env.STRIPE_WEBHOOK_SECRET);
  const livePaymentsAllowed = parseBoolean(env.STRIPE_LIVE_PAYMENTS_ALLOWED);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (enabled) {
    if (!['test', 'live'].includes(rawMode)) {
      errors.push('STRIPE_MODE deve ser test ou live.');
    }
    if (keyKind === 'missing') {
      errors.push('STRIPE_RESTRICTED_KEY não está configurada.');
    } else if (keyKind === 'invalid') {
      errors.push('STRIPE_RESTRICTED_KEY deve ser uma Restricted API Key da Stripe.');
    } else if (mode === 'test' && keyKind !== 'test') {
      errors.push('STRIPE_MODE=test exige uma Restricted API Key rk_test_.');
    } else if (mode === 'live' && keyKind !== 'live') {
      errors.push('STRIPE_MODE=live exige uma Restricted API Key rk_live_.');
    }

    if (mode === 'live' && !livePaymentsAllowed) {
      errors.push('Pagamentos live exigem STRIPE_LIVE_PAYMENTS_ALLOWED=true.');
    }
    if (mode === 'test' && livePaymentsAllowed) {
      errors.push('STRIPE_MODE=test exige STRIPE_LIVE_PAYMENTS_ALLOWED=false.');
    }

    if (!webhookConfigured) {
      warnings.push('STRIPE_WEBHOOK_SECRET ainda não está configurado.');
    } else if (!webhookValid) {
      errors.push('STRIPE_WEBHOOK_SECRET não possui o formato esperado.');
    }
  }

  const readyForCheckout = enabled
    && ((mode === 'test' && keyKind === 'test')
      || (mode === 'live' && keyKind === 'live' && livePaymentsAllowed))
    && errors.length === 0;

  return {
    enabled,
    mode,
    restrictedKeyConfigured: keyKind !== 'missing',
    restrictedKeyKind: keyKind,
    webhookSecretConfigured: webhookConfigured,
    webhookSecretLooksValid: webhookValid,
    environmentGuardActive: mode === 'test' || !livePaymentsAllowed,
    livePaymentsAllowed,
    readyForCheckout,
    readyForWebhookValidation: readyForCheckout && webhookValid,
    warnings,
    errors,
  };
}

export function requireStripeConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const readiness = inspectStripeFoundationConfiguration(env);
  if (!readiness.enabled) {
    throw new StripeFoundationConfigError(
      'STRIPE_DISABLED',
      'A integração Stripe está desativada.',
    );
  }
  if (!readiness.readyForCheckout) {
    throw new StripeFoundationConfigError(
      'STRIPE_ENVIRONMENT_NOT_READY',
      readiness.errors[0] || 'A integração Stripe não está pronta neste ambiente.',
    );
  }

  return {
    mode: readiness.mode,
    restrictedKey: String(env.STRIPE_RESTRICTED_KEY || '').trim(),
    livePaymentsAllowed: readiness.livePaymentsAllowed,
  } as const;
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

export function requireStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env) {
  const readiness = inspectStripeFoundationConfiguration(env);
  if (!readiness.readyForWebhookValidation) {
    throw new StripeFoundationConfigError(
      'STRIPE_WEBHOOK_NOT_READY',
      readiness.errors[0] || 'A validação de webhook Stripe ainda não está pronta neste ambiente.',
    );
  }
  return String(env.STRIPE_WEBHOOK_SECRET || '').trim();
}
