import { pathToFileURL } from 'node:url';

/**
 * Fail closed for CI runs: no SQL commands or browser tests may use a remote DB.
 * Errors deliberately omit connection strings, usernames and passwords.
 */
export function assertLocalDatabaseUrl(value, expectedDatabase, key = 'DATABASE_URL') {
  if (!value || !expectedDatabase) throw new Error(`${key}: database configuration is missing`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key}: invalid PostgreSQL URL`);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${key}: not a PostgreSQL URL`);
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname.toLowerCase())) {
    throw new Error(`${key}: remote database forbidden in CI`);
  }
  if (url.port && url.port !== '5432') {
    throw new Error(`${key}: unexpected port`);
  }
  if (decodeURIComponent(url.pathname) !== `/${expectedDatabase}`) {
    throw new Error(`${key}: wrong disposable database`);
  }
  if (url.hash || [...url.searchParams.keys()].some(key => key !== 'schema') ||
      url.searchParams.getAll('schema').length > 1 ||
      (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error(`${key}: unexpected disposable database URL parameters`);
  }
  if (url.username !== 'postgres') {
    throw new Error(`${key}: unexpected disposable database role`);
  }
  return true;
}

export function assertCIIsolatedDatabase(env, expectedDatabase, requireDirect = false) {
  assertLocalDatabaseUrl(env.DATABASE_URL, expectedDatabase, 'DATABASE_URL');
  if (requireDirect && !env.DIRECT_URL) {
    throw new Error('DIRECT_URL: required for E2E');
  }
  if (env.DIRECT_URL) {
    assertLocalDatabaseUrl(env.DIRECT_URL, expectedDatabase, 'DIRECT_URL');
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertCIIsolatedDatabase(
      process.env,
      process.argv[2],
      process.argv.includes('--require-direct'),
    );
    process.stdout.write('CI database isolation: local disposable database confirmed.\n');
  } catch (error) {
    process.stderr.write(`CI database isolation blocked: ${error.message}\n`);
    process.exitCode = 1;
  }
}
