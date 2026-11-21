import { PR00_STAGING } from './pr00-staging-db-identity';

type Env = Record<string, string | undefined>;
type PreviewConfig = {
  crons?: unknown;
  git?: { deploymentEnabled?: Record<string, unknown> };
};

/**
 * PR00-only build-time config gate. It does NOT make a network firewall,
 * attest external provider accounts, or protect outbound traffic at runtime.
 * Any sensitive provider credential in this Preview must trigger a re-review.
 */
const PROVIDER_CREDENTIAL_PREFIX = /^(?:NEXT_PUBLIC_)?(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|META|FACEBOOK|WHATSAPP|STRIPE|ZAPSIGN|TWILIO|RESEND|SENDGRID|MAILGUN|SLACK|TELEGRAM|UPSTASH|QSTASH|MONGODB|REDIS|SUPABASE|BLOB|KV)(?:_|$)/;
const BACKGROUND_JOB_CREDENTIALS = new Set([
  'CRON_SECRET',
  'INTERNAL_JOB_SECRET',
  'INTERNAL_API_KEY',
  'INTERNAL_WORKER_SECRET',
]);

export function pr00StagingIntegrationPreflightChecks(env: Env, config: unknown) {
  const parsed: PreviewConfig | undefined = config && typeof config === 'object' && !Array.isArray(config)
    ? config as PreviewConfig : undefined;
  const keys = Object.keys(env);
  const forbiddenIntegrationCredentialsAbsent = keys.every(
    (key) => !PROVIDER_CREDENTIAL_PREFIX.test(key) && !BACKGROUND_JOB_CREDENTIALS.has(key),
  );
  return {
    exactIsolatedProject: env.VERCEL_PROJECT_ID === PR00_STAGING.vercelProjectId,
    exactDiagnosticBranch: env.VERCEL_GIT_COMMIT_REF === PR00_STAGING.previewBranch,
    previewOnly: env.VERCEL_ENV === 'preview',
    noScheduledCronInRepoConfig: Boolean(parsed)
      && (parsed?.crons === undefined || (Array.isArray(parsed.crons) && parsed.crons.length === 0)),
    automaticDiagnosticDeployDisabled: Boolean(parsed)
      && parsed?.git?.deploymentEnabled?.[PR00_STAGING.previewBranch] === false,
    forbiddenIntegrationCredentialsAbsent,
  };
}

export function pr00StagingIntegrationPreflightApproved(env: Env, config: unknown): boolean {
  return Object.values(pr00StagingIntegrationPreflightChecks(env, config)).every(Boolean);
}
