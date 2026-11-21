import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  matchesLiveDatabaseIdentity,
  matchesStagingIdentityToken,
  stagingIdentityGateEnabled,
} from '@/lib/security/pr00-staging-db-identity';

// Disabled by default; never read CRM/customer tables, send emails or call integrations.
// This does NOT certify all outbound integrations or full database recovery.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

function reply(status: number, code: string) {
  return NextResponse.json({ ok: status === 200, code }, { status, headers: HEADERS });
}

export async function GET(request: Request) {
  // Do not disclose which guard failed, the host, credentials, schema or DB errors.
  if (!stagingIdentityGateEnabled(process.env)) return reply(404, 'not_found');

  if (!matchesStagingIdentityToken(
    request.headers.get('x-pr00-staging-attestation-token'),
    process.env.PR00_STAGING_ATTESTATION_TOKEN,
  )) return reply(404, 'not_found');

  try {
    const rows = await prisma.$queryRaw<Array<{
      database_name: string;
      role_name: string;
    }>>`SELECT current_database() AS database_name, current_user AS role_name`;

    if (rows.length !== 1 || !matchesLiveDatabaseIdentity(rows[0])) {
      return reply(503, 'identity_mismatch');
    }

    // Binary answer only: no credentials, row values, IDs or PII.
    return reply(200, 'staging_database_confirmed');
  } catch {
    // Never log or serialize database driver errors.
    return reply(503, 'identity_unavailable');
  }
}
