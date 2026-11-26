import type { SessionPayload } from '@/lib/auth';
import * as apiPolicy from '@/lib/api-v1/policy';
import { mayManageApiV1Credentials } from '@/lib/api-v1/prisma-credential-repository';
import { ApiV1Card } from './api-v1-card';

export async function NativeApiPanel({ session }: { session: SessionPayload }) {
  if (session.role !== 'developer') return null;
  const enabled = apiPolicy.apiV1Enabled(process.env);
  const pilot = apiPolicy.apiV1PilotTenantAllowed(session.tenantId, process.env);
  const allowed = enabled && pilot && await mayManageApiV1Credentials({ userId: session.userId, tenantId: session.tenantId }, session.tenantId);
  return <section id="flipform-api" className="scroll-mt-24 space-y-4">
    <header><h2 className="text-xl font-semibold">API do FlipForm — tokens e permissões</h2><p className="text-sm text-muted-foreground mt-1">Acesso de sistemas externos aos recursos autorizados do FlipForm.</p></header>
    <section className="rounded-xl border bg-card p-5 space-y-2">
      <h2 className="font-semibold">Status de administração</h2>
      <p className="text-sm">{!enabled ? 'A API está desativada neste ambiente.' : !pilot ? 'Esta empresa ainda não está autorizada na lista piloto da API.' : !allowed ? 'Acesso técnico indisponível. Confira o vínculo de Desenvolvedor, MFA, elegibilidade da assinatura e disponibilidade do banco. A autorização de cortesia para chaves da API ainda depende de validação específica.' : 'Administração autorizada. As permissões de cada chave e integração continuam sendo verificadas pelo servidor.'}</p>
    </section>
    {allowed && <ApiV1Card />}
    <section className="rounded-xl border bg-card p-5 space-y-3"><h2 className="font-semibold">Escopos disponíveis na interface</h2>
      <ul className="list-disc pl-5 text-sm space-y-1"><li>integrations.read — diagnóstico</li><li>pipelines.read — pipelines</li><li>forms.read — formulários</li><li>pipelines.metrics.read — contagens por etapa</li><li>leads.metadata.read — metadados operacionais</li></ul>
      <p className="text-sm text-muted-foreground">Não são permissões para movimentar ou apagar leads, enviar mensagens ou consultar documentos.</p>
    </section>
  </section>;
}
