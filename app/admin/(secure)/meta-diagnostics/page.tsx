import { MetaAdsSafetyDiagnosticsPanel } from '../integrations/meta-ads-safety-diagnostics-panel';

export default function MetaAdsDiagnosticsPage() {
  return <div className="p-8 space-y-6 max-w-6xl">
    <div>
      <h1 className="font-heading text-2xl font-bold">Diagnóstico Meta Ads</h1>
      <p className="text-sm text-muted-foreground">Auditoria operacional somente leitura para verificar conta, campanhas e atividade recente sem alterar anúncios.</p>
    </div>
    <MetaAdsSafetyDiagnosticsPanel />
  </div>;
}
