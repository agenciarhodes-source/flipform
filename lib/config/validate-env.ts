export type EnvCheck = {
  key: string;
  ok: boolean;
  message: string;
};

export type EnvValidationResult = {
  ok: boolean;
  errors: string[];
  checks: EnvCheck[];
  environment: {
    nodeEnv: string;
    vercelEnv: string;
    productionLike: boolean;
  };
  groups: Record<string, boolean>;
};

const PROHIBITED_TOKENS = ['test-placeholder', 'staging-local-secret', 'changeme', 'change-me', 'placeholder', 'dummy', 'example', 'secret'];

function hasValue(value: string | undefined | null) {
  return Boolean(value && String(value).trim().length > 0);
}

function isHttpsUrl(url: string | undefined) {
  if (!hasValue(url)) return false;
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function endsWithFlipformDomain(email: string | undefined) {
  if (!hasValue(email)) return false;
  return String(email).toLowerCase().trim().endsWith('@flipform.com.br');
}

function includesProhibitedToken(v: string | undefined | null) {
  if (!hasValue(v)) return false;
  const value = String(v).toLowerCase();
  return PROHIBITED_TOKENS.some((token) => value.includes(token));
}

export function validateEnvironment(env: NodeJS.ProcessEnv): EnvValidationResult {
  const nodeEnv = String(env.NODE_ENV || 'development');
  const vercelEnv = String(env.VERCEL_ENV || '');
  const productionLike = nodeEnv === 'production' || vercelEnv === 'production';

  const checks: EnvCheck[] = [];
  const errors: string[] = [];

  function addCheck(key: string, ok: boolean, successMessage: string, failMessage: string) {
    checks.push({ key, ok, message: ok ? successMessage : failMessage });
    if (!ok) errors.push(failMessage);
  }

  addCheck('NEXT_PUBLIC_MARKETING_URL', hasValue(env.NEXT_PUBLIC_MARKETING_URL), 'NEXT_PUBLIC_MARKETING_URL configured', 'NEXT_PUBLIC_MARKETING_URL is required.');
  addCheck('NEXT_PUBLIC_APP_URL', hasValue(env.NEXT_PUBLIC_APP_URL), 'NEXT_PUBLIC_APP_URL configured', 'NEXT_PUBLIC_APP_URL is required.');
  addCheck('NEXT_PUBLIC_ADMIN_URL', hasValue(env.NEXT_PUBLIC_ADMIN_URL), 'NEXT_PUBLIC_ADMIN_URL configured', 'NEXT_PUBLIC_ADMIN_URL is required.');
  addCheck('APP_HOSTNAME', hasValue(env.APP_HOSTNAME), 'APP_HOSTNAME configured', 'APP_HOSTNAME is required.');
  addCheck('ADMIN_HOSTNAME', hasValue(env.ADMIN_HOSTNAME), 'ADMIN_HOSTNAME configured', 'ADMIN_HOSTNAME is required.');
  addCheck('DATABASE_URL', hasValue(env.DATABASE_URL), 'DATABASE_URL configured', 'DATABASE_URL is required.');
  addCheck('JWT_SECRET_CURRENT', hasValue(env.JWT_SECRET_CURRENT), 'JWT_SECRET_CURRENT configured', 'JWT_SECRET_CURRENT is required.');
  addCheck('ASAAS_BASE_URL', hasValue(env.ASAAS_BASE_URL), 'ASAAS_BASE_URL configured', 'ASAAS_BASE_URL is required.');
  addCheck('ASAAS_API_KEY', hasValue(env.ASAAS_API_KEY), 'ASAAS_API_KEY configured', 'ASAAS_API_KEY is required.');
  addCheck('ASAAS_WEBHOOK_TOKEN', hasValue(env.ASAAS_WEBHOOK_TOKEN), 'ASAAS_WEBHOOK_TOKEN configured', 'ASAAS_WEBHOOK_TOKEN is required.');
  addCheck('EMAIL_PROVIDER', hasValue(env.EMAIL_PROVIDER), 'EMAIL_PROVIDER configured', 'EMAIL_PROVIDER is required.');
  addCheck('EMAIL_FROM', hasValue(env.EMAIL_FROM), 'EMAIL_FROM configured', 'EMAIL_FROM is required.');
  addCheck('EMAIL_REPLY_TO', hasValue(env.EMAIL_REPLY_TO), 'EMAIL_REPLY_TO configured', 'EMAIL_REPLY_TO is required.');
  addCheck('CRON_SECRET', hasValue(env.CRON_SECRET), 'CRON_SECRET configured', 'CRON_SECRET is required.');
  addCheck('INTERNAL_JOB_SECRET', hasValue(env.INTERNAL_JOB_SECRET), 'INTERNAL_JOB_SECRET configured', 'INTERNAL_JOB_SECRET is required.');

  addCheck('NEXT_PUBLIC_MARKETING_URL format', isHttpsUrl(env.NEXT_PUBLIC_MARKETING_URL), 'NEXT_PUBLIC_MARKETING_URL valid URL', 'NEXT_PUBLIC_MARKETING_URL must be a valid https URL.');
  addCheck('NEXT_PUBLIC_APP_URL format', isHttpsUrl(env.NEXT_PUBLIC_APP_URL), 'NEXT_PUBLIC_APP_URL valid URL', 'NEXT_PUBLIC_APP_URL must be a valid https URL.');
  addCheck('NEXT_PUBLIC_ADMIN_URL format', isHttpsUrl(env.NEXT_PUBLIC_ADMIN_URL), 'NEXT_PUBLIC_ADMIN_URL valid URL', 'NEXT_PUBLIC_ADMIN_URL must be a valid https URL.');

  const provider = String(env.EMAIL_PROVIDER || '').toLowerCase();
  if (!['none', 'smtp', 'resend'].includes(provider)) {
    errors.push('EMAIL_PROVIDER must be one of: none, smtp, resend.');
    checks.push({ key: 'EMAIL_PROVIDER allowed values', ok: false, message: 'EMAIL_PROVIDER must be one of: none, smtp, resend.' });
  } else {
    checks.push({ key: 'EMAIL_PROVIDER allowed values', ok: true, message: 'EMAIL_PROVIDER value accepted' });
  }

  if (provider === 'smtp') {
    addCheck('SMTP_HOST', hasValue(env.SMTP_HOST), 'SMTP_HOST configured', 'SMTP_HOST is required when EMAIL_PROVIDER=smtp.');
    addCheck('SMTP_PORT', hasValue(env.SMTP_PORT), 'SMTP_PORT configured', 'SMTP_PORT is required when EMAIL_PROVIDER=smtp.');
    addCheck('SMTP_USER', hasValue(env.SMTP_USER), 'SMTP_USER configured', 'SMTP_USER is required when EMAIL_PROVIDER=smtp.');
    addCheck('SMTP_PASSWORD', hasValue(env.SMTP_PASSWORD), 'SMTP_PASSWORD configured', 'SMTP_PASSWORD is required when EMAIL_PROVIDER=smtp.');
    addCheck('SMTP_SECURE', hasValue(env.SMTP_SECURE), 'SMTP_SECURE configured', 'SMTP_SECURE is required when EMAIL_PROVIDER=smtp.');
  }

  if (provider === 'resend') {
    addCheck('RESEND_API_KEY', hasValue(env.RESEND_API_KEY), 'RESEND_API_KEY configured', 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
  }

  if (productionLike) {
    addCheck('NEXT_PUBLIC_MARKETING_URL production', env.NEXT_PUBLIC_MARKETING_URL === 'https://flipform.com.br', 'NEXT_PUBLIC_MARKETING_URL production value OK', 'NEXT_PUBLIC_MARKETING_URL must be https://flipform.com.br in production.');
    addCheck('NEXT_PUBLIC_APP_URL production', env.NEXT_PUBLIC_APP_URL === 'https://app.flipform.com.br', 'NEXT_PUBLIC_APP_URL production value OK', 'NEXT_PUBLIC_APP_URL must be https://app.flipform.com.br in production.');
    addCheck('NEXT_PUBLIC_ADMIN_URL production', env.NEXT_PUBLIC_ADMIN_URL === 'https://admin.flipform.com.br', 'NEXT_PUBLIC_ADMIN_URL production value OK', 'NEXT_PUBLIC_ADMIN_URL must be https://admin.flipform.com.br in production.');
    addCheck('APP_HOSTNAME production', env.APP_HOSTNAME === 'app.flipform.com.br', 'APP_HOSTNAME production value OK', 'APP_HOSTNAME must be app.flipform.com.br in production.');
    addCheck('ADMIN_HOSTNAME production', env.ADMIN_HOSTNAME === 'admin.flipform.com.br', 'ADMIN_HOSTNAME production value OK', 'ADMIN_HOSTNAME must be admin.flipform.com.br in production.');

    const allowSandbox = String(env.ALLOW_SANDBOX_ASAAS_IN_PRODUCTION || '').toLowerCase() === 'true';
    if (env.ASAAS_BASE_URL !== 'https://api.asaas.com/v3' && !allowSandbox) {
      errors.push('ASAAS_BASE_URL must be https://api.asaas.com/v3 in production (or ALLOW_SANDBOX_ASAAS_IN_PRODUCTION=true).');
      checks.push({ key: 'ASAAS_BASE_URL production', ok: false, message: 'ASAAS_BASE_URL must point to production Asaas in production.' });
    } else {
      checks.push({ key: 'ASAAS_BASE_URL production', ok: true, message: 'ASAAS_BASE_URL production policy OK' });
    }

    const allowNone = String(env.ALLOW_EMAIL_PROVIDER_NONE_IN_PRODUCTION || '').toLowerCase() === 'true';
    if (provider === 'none' && !allowNone) {
      errors.push('EMAIL_PROVIDER=none is not allowed in production (unless ALLOW_EMAIL_PROVIDER_NONE_IN_PRODUCTION=true).');
      checks.push({ key: 'EMAIL_PROVIDER production policy', ok: false, message: 'EMAIL_PROVIDER=none blocked in production.' });
    } else if (!['smtp', 'resend', 'none'].includes(provider)) {
      checks.push({ key: 'EMAIL_PROVIDER production policy', ok: false, message: 'Invalid EMAIL_PROVIDER in production.' });
    } else {
      checks.push({ key: 'EMAIL_PROVIDER production policy', ok: true, message: 'EMAIL_PROVIDER production policy OK' });
    }

    addCheck('EMAIL_FROM domain', endsWithFlipformDomain(env.EMAIL_FROM), 'EMAIL_FROM domain OK', 'EMAIL_FROM must end with @flipform.com.br.');
    addCheck('EMAIL_REPLY_TO domain', endsWithFlipformDomain(env.EMAIL_REPLY_TO), 'EMAIL_REPLY_TO domain OK', 'EMAIL_REPLY_TO must end with @flipform.com.br.');

    const jwt = String(env.JWT_SECRET_CURRENT || '');
    if (jwt.length < 32) errors.push('JWT_SECRET_CURRENT must be at least 32 characters in production.');

    const sensitiveKeys = [
      'DATABASE_URL',
      'JWT_SECRET_CURRENT',
      'ASAAS_API_KEY',
      'ASAAS_WEBHOOK_TOKEN',
      'CRON_SECRET',
      'INTERNAL_JOB_SECRET',
    ] as const;

    for (const key of sensitiveKeys) {
      if (includesProhibitedToken(env[key])) {
        errors.push(`${key} contains a prohibited placeholder value in production.`);
      }
    }

    if (provider === 'smtp' && includesProhibitedToken(env.SMTP_PASSWORD)) {
      errors.push('SMTP_PASSWORD contains a prohibited placeholder value in production.');
    }
    if (provider === 'resend' && includesProhibitedToken(env.RESEND_API_KEY)) {
      errors.push('RESEND_API_KEY contains a prohibited placeholder value in production.');
    }
  }

  const groups = {
    publicUrls: hasValue(env.NEXT_PUBLIC_MARKETING_URL) && hasValue(env.NEXT_PUBLIC_APP_URL) && hasValue(env.NEXT_PUBLIC_ADMIN_URL),
    hostRouting: hasValue(env.APP_HOSTNAME) && hasValue(env.ADMIN_HOSTNAME),
    database: hasValue(env.DATABASE_URL),
    auth: hasValue(env.JWT_SECRET_CURRENT),
    asaas: hasValue(env.ASAAS_BASE_URL) && hasValue(env.ASAAS_API_KEY) && hasValue(env.ASAAS_WEBHOOK_TOKEN),
    email: hasValue(env.EMAIL_PROVIDER) && hasValue(env.EMAIL_FROM) && hasValue(env.EMAIL_REPLY_TO),
    internalJobs: hasValue(env.CRON_SECRET) && hasValue(env.INTERNAL_JOB_SECRET),
    observability: true,
  };

  return {
    ok: errors.length === 0,
    errors,
    checks,
    environment: { nodeEnv, vercelEnv, productionLike },
    groups,
  };
}
