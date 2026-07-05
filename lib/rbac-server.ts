// Server-only: wraps API handlers with permission checks. Importa lib/auth (jsonwebtoken).
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest, type SessionPayload } from './auth';
import { can, type PermissionKey } from './rbac';

// Re-exporta tudo do rbac client-safe para conveniencia em APIs.
export * from './rbac';

export function withPermission<T = any>(
  permission: PermissionKey,
  handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest, ctx: T) => {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(session.role, permission)) {
      return NextResponse.json({ error: 'Você não tem permissão para acessar esta funcionalidade.', required: permission }, { status: 403 });
    }
    return handler(req, session, ctx);
  };
}
