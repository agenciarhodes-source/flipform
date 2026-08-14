import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';

const denied = () => NextResponse.json({
  error: 'A vinculação de contas de anúncios e Pixels é gerenciada com segurança pelo administrador da plataforma.',
  code: 'META_ASSET_BINDING_ADMIN_ONLY',
}, { status: 403 });

// SECURITY: tenant sessions must never enumerate the Meta identity's accessible
// ad accounts or Pixels. A connected identity may have access to multiple clients.
// Discovery and binding are restricted to platform-admin routes, and tenant
// runtime consumes only the asset IDs already bound to its own connection.
export const GET = withPermission('INTEGRATIONS_VIEW', async () => denied());
export const PUT = withPermission('INTEGRATIONS_EDIT', async () => denied());
