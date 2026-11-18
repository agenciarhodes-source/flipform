import { pathToFileURL } from 'node:url';

const ACTIONS = new Set([
  'production-schema',
  'business-group-schema',
  'team-hierarchy-schema',
  'whatsapp-cloud-schema',
]);

function refuse(reason) {
  throw new Error('Production maintenance blocked: ' + reason);
}

function assertConnection(value, host, database, user, label) {
  if (!value) refuse(label + ' missing');
  let url;
  try { url = new URL(value); } catch { refuse(label + ' invalid URL'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) refuse(label + ' invalid protocol');
  if (!url.hostname || url.hostname.toLowerCase() !== host.toLowerCase()) refuse(label + ' unexpected host');
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) refuse(label + ' cannot be local');
  if (decodeURIComponent(url.pathname) !== '/' + database) refuse(label + ' unexpected database');
  if (decodeURIComponent(url.username) !== user) refuse(label + ' unexpected database user');
  if (!url.password) refuse(label + ' password missing');
  if (!['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) {
    refuse(label + ' must use explicit TLS');
  }
}

export function assertProductionMaintenance(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') refuse('only manual workflow dispatch allowed');
  if (env.GITHUB_REF !== 'refs/heads/main') refuse('main branch required');
  if (!ACTIONS.has(env.MAINTENANCE_ACTION)) refuse('unexpected action');
  if (env.MAINTENANCE_CONFIRM !== 'REPAIR ' + env.MAINTENANCE_ACTION) refuse('explicit confirmation required');
  if (env.MAINTENANCE_ENVIRONMENT !== 'production-maintenance') refuse('protected environment required');
  if (env.MAINTENANCE_GATE !== 'enabled') refuse('maintenance gate not configured');
  for (const name of ['MAINTENANCE_DB_HOST', 'MAINTENANCE_DIRECT_HOST', 'MAINTENANCE_DB_NAME', 'MAINTENANCE_DB_USER']) {
    if (!env[name]) refuse('required allowlist configuration missing: ' + name);
  }
  assertConnection(env.DATABASE_URL, env.MAINTENANCE_DB_HOST, env.MAINTENANCE_DB_NAME, env.MAINTENANCE_DB_USER, 'DATABASE_URL');
  assertConnection(env.DIRECT_URL, env.MAINTENANCE_DIRECT_HOST, env.MAINTENANCE_DB_NAME, env.MAINTENANCE_DB_USER, 'DIRECT_URL');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertProductionMaintenance(process.env);
    process.stdout.write('Production maintenance preflight: target allowlist verified. No SQL executed.\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
