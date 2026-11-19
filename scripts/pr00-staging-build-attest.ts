import { PrismaClient } from '@prisma/client';
import { matchesLiveDatabaseIdentity, stagingIdentityBuildGateEnabled, stagingIdentityPreflightChecks } from '../lib/security/pr00-staging-db-identity';

// Executed ONLY by this Draft branch build command, never by main.
// GitHub CI runs with no VERCEL runtime so it intentionally does NOT touch Neon.
// On a Vercel build it fails closed before Next.js build unless the destination
// is the exact isolated PR00 staging Preview and the two DB URLs are allowlisted.
async function main() {
  if (process.env.VERCEL !== '1') {
    process.stdout.write('PR00 staging build identity: offline CI/local skip (no DB query).\n');
    return;
  }

  if (!stagingIdentityBuildGateEnabled(process.env)) {
    // Log only per-condition booleans: never inspect or print credentials/URLs.
    const checks = stagingIdentityPreflightChecks(process.env);
    for (const [name, ok] of Object.entries(checks)) {
      process.stderr.write('PR00 staging preflight ' + name + ': ' + (ok ? 'pass' : 'blocked') + '\n');
    }
    throw new Error('PR00 staging build blocked: identity preflight denied');
  }

  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const rows = await prisma.$queryRaw<Array<{ database_name: string; role_name: string }>>`SELECT current_database() AS database_name, current_user AS role_name`;
    if (rows.length !== 1 || !matchesLiveDatabaseIdentity(rows[0])) {
      throw new Error('PR00 staging build blocked: runtime database identity mismatch');
    }
    process.stdout.write('PR00 staging build identity: allowed database and role confirmed. No user tables accessed.\n');
  } catch {
    // Never print Prisma/driver exception; it may include connection metadata.
    throw new Error('PR00 staging build blocked: database identity probe failed');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});
