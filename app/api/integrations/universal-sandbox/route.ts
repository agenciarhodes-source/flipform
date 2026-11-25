import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { isInboxOnlyPlan } from '@/lib/billing/inbox-plan-rules';
import { tenantPlanSlug } from '@/lib/session-access';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { listConnections, registerSandboxCredential, revokeConnection } from '@/lib/universal-connectors/registry';
import { sandboxAvailable, sandboxOriginAllowed, validCredential } from '@/lib/universal-connectors/sandbox-policy';
import { probeAsaasSandbox } from '@/lib/universal-connectors/asaas-sandbox';
import { ASAAS_SANDBOX } from '@/lib/universal-connectors/catalog';
import { currentVaultKey } from '@/lib/universal-connectors/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = () => json({ error: 'Sandbox indisponível.' }, 403);

async function boundedBody(req: Request): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !req.body) throw new Error();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
function eligible(role: string, tenantId: string, globalRole?: string | null) {
  return role === 'developer' && globalRole !== 'platform_admin' && sandboxAvailable(tenantId);
}
export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  if (!eligible(session.role, session.tenantId, session.globalRole)) return denied();
  try {
    if (isInboxOnlyPlan(await tenantPlanSlug(session.tenantId))) return denied();
    const rows = await listConnections({ tenantId: session.tenantId, userId: session.userId });
    return json({ connections: rows.filter(row => row.providerId === ASAAS_SANDBOX.providerId) });
  } catch { return denied(); }
});
export const POST = withPermission('INTEGRATIONS_MANAGE', async (req, session) => {
  if (!eligible(session.role, session.tenantId, session.globalRole) || !sandboxOriginAllowed(req.headers.get('origin'))) return denied();
  const actor = { tenantId: session.tenantId, userId: session.userId };
  try {
    if (isInboxOnlyPlan(await tenantPlanSlug(actor.tenantId))) return denied();
    const rows = await listConnections(actor); // verifies direct active owner membership before any egress
    const rl = await rateLimit({ key: 'universal-sandbox:' + actor.tenantId, limit: 6, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl);
    let body: unknown;
    try { body = await boundedBody(req); } catch { return json({ error: 'Solicitação inválida.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Solicitação inválida.' }, 400);
    const value = body as Record<string,unknown>;
    if (value.action === 'disconnect' && Object.keys(value).length === 2 && typeof value.id === 'string') {
      if (!rows.some(row => row.id === value.id && row.providerId === ASAAS_SANDBOX.providerId && !row.revokedAt)) return denied();
      await revokeConnection(actor, value.id);
      return json({ ok: true });
    }
    if ((value.action !== 'test' && value.action !== 'connect') || Object.keys(value).length !== 2 || !validCredential(value.secret)) return json({ error: 'Solicitação inválida.' }, 400);
    if (value.action === 'connect') currentVaultKey(); // fail before egress if vault unavailable
    const result = await probeAsaasSandbox(actor.tenantId, value.secret);
    if (result !== 'accepted') return json({ error: result === 'rejected' ? 'Credencial recusada pelo sandbox.' : 'Não foi possível testar o sandbox.' }, 422);
    if (value.action === 'test') return json({ ok: true, message: 'Credencial aceita pelo sandbox. Nenhum dado salvo.' });
    await registerSandboxCredential(actor, value.secret);
    return json({ ok: true, message: 'Credencial de teste armazenada. Sincronização desativada.' });
  } catch { return json({ error: 'Não foi possível concluir a operação.' }, 403); }
});
