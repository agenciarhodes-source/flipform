import { pr00InstrumentationDecision } from './lib/security/pr00-staging-instrumentation-policy';

export async function register() {
  // This PR00-only branch is a single-purpose staging diagnostic. Do not run
  // Sentry, tracing exporters or other telemetry in its Vercel Preview.
  // Inspect the environment before any dynamic import with network side effects.
  const decision = pr00InstrumentationDecision(process.env);
  if (decision === 'deny') {
    throw new Error('PR00 staging instrumentation blocked: unexpected Vercel environment');
  }
  if (decision === 'skip-telemetry') return;

  // Normal offline CI/local mode. NEVER merge the temporary PR00 policy to main.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
