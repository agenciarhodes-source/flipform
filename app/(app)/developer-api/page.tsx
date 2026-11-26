import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getVerifiedSession } from '@/lib/auth';
import { getWorkspace360Access } from '@/lib/workspace-360/access';
import { apiV1Enabled, apiV1PilotTenantAllowed } from '@/lib/api-v1/policy';
import { mayManageApiV1Credentials } from '@/lib/api-v1/prisma-credential-repository';
import { ApiV1Card } from '../integrations/api-v1-card';

export const dynamic = 'force-dynamic';
export default async function DeveloperApiPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (session.role !== 'developer' || !(await getWorkspace360Access(session)).api) redirect('/dashboard');
  const enabled = apiV1Enabled(process.env);
  const pilot = apiV1PilotTenantAllowed(session.tenantId, process.env);
  const allowed = enabled && pilot && await mayManageApiV1Credentials({ userId: session.userId, tenantId: session.tenantId }, session.tenantId);
  return <main className="p-6 max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-bold">API</h1><p className="text-sm text-muted-foreground mt-1">Acesso de sistemas externos aos recursos autorizados do FlipForm.</p></header>
    <section className="rounded-xl border bg-card p-5 space-y-2">
      <h2 className="font-semibold">Status de administração</h2>
      <p className="text-sm">{!enabled ? 'A API está desativada neste ambiente.' : !pilot ? 'Esta empresa ainda não está autorizada na lista piloto da API.' : !allowed ? 'Acesso técnico indisponível. Confira o vínculo de Desenvolvedor, MFA, elegibilidade da assinatura e disponibilidade do banco. A autorização de cortesia para chaves da API ainda depende de validação específica.' : 'Administração autorizada. As permissões de cada chave e integração continuam sendo verificadas pelo servidor.'}</p>
    </section>
    {allowed && <ApiV1Card />}
    <section className="rounded-xl border bg-card p-5 space-y-3"><h2 className="font-semibold">Escopos disponíveis na interface</h2>
      <ul className="list-disc pl-5 text-sm space-y-1"><li>integrations.read — diagnóstico</li><li>pipelines.read — pipelines</li><li>forms.read — formulários</li><li>pipelines.metrics.read — contagens por etapa</li><li>leads.metadata.read — metadados operacionais</li></ul>
      <p className="text-sm text-muted-foreground">Não são permissões para movimentar ou apagar leads, enviar mensagens ou consultar documentos.</p>
      <Link href="/integrations" className="text-sm underline">Conexões com sistemas externos</Link>
    </section>
  </main>;
}
