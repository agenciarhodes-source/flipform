// Server-only: wraps API handlers with permission checks. Importa lib/auth (jsonwebtoken).
import 'server-only';
import { resolveRouteContext } from '@/lib/http/route-context';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest, getVerifiedSessionFromRequest, type SessionPayload } from './auth';
import { tenantAccessAllowed } from './session-access';
import { permissionWorksWhenBlocked } from './session-access-rules';
import { can, type PermissionKey } from './rbac';

// Re-exporta tudo do rbac client-safe para conveniencia em APIs.
export * from './rbac';

export function withPermission<T = any>(
  permission: PermissionKey,
  handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest, rawCtx: any) => {
    const ctx = await resolveRouteContext(rawCtx as T);
    if (!getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Role and access come from the database on every request (security protocol S2).
    const session = await getVerifiedSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Sua sessão terminou. Entre novamente.', code: 'session_revoked' }, { status: 401 });
    if (!can(session.role, permission)) {
      return NextResponse.json({ error: 'Você não tem permissão para acessar esta funcionalidade.', required: permission }, { status: 403 });
    }
    // A blocked company keeps only what it needs to pay; everything else stops, as in withAuth.
    if (!permissionWorksWhenBlocked(permission)) {
      const tenant = await tenantAccessAllowed(session);
      if (!tenant.allow) {
        return NextResponse.json({
          error: 'Acesso bloqueado. Entre em contato com o administrador.',
          code: 'tenant_blocked', status: tenant.status, reason: tenant.reason,
        }, { status: 403 });
      }
    }
    return handler(req, session, ctx);
  };
}
