import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  isPr629DbAttestationAllowed,
  pr629DbTargetsMatchApprovedQa,
  PR629_QA_DB_NAME,
} from '@/lib/qa/pr629-db-target-attestation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function authorized(req: Request): boolean {
  const configured = process.env.PR629_DB_ATTESTATION_TOKEN;
  if (!configured || configured.length < 32 || configured.length > 256) return false;
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return false;
  const provided = bearer.slice(7);
  if (provided.length !== configured.length) return false;
  const expectedBytes = Buffer.from(configured, 'utf8');
  const suppliedBytes = Buffer.from(provided, 'utf8');
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

/**
 * Disabled by default. Preview-only, exact-branch, bearer-gated, no PII.
 * No database query is attempted unless BOTH configured connection targets
 * match the approved QA Neon endpoint. Never call or expose in production.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isPr629DbAttestationAllowed(process.env) || !authorized(req)) {
    return Response.json({ code: 'not_found' }, { status: 404, headers: responseHeaders });
  }
  if (!pr629DbTargetsMatchApprovedQa(process.env)) {
    return Response.json({ attested: false, code: 'qa_target_mismatch' },
      { status: 409, headers: responseHeaders });
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`SELECT current_database()::text AS database_name`;
    if (rows.length !== 1 || rows[0]?.database_name !== PR629_QA_DB_NAME) {
      return Response.json({ attested: false, code: 'database_identity_mismatch' },
        { status: 409, headers: responseHeaders });
    }
    return Response.json({
      attested: true,
      code: 'approved_qa_database_only',
      scope: 'pr629-preview-database-identity',
    }, { status: 200, headers: responseHeaders });
  } catch {
    return Response.json({ attested: false, code: 'database_unavailable' },
      { status: 503, headers: responseHeaders });
  }
}
