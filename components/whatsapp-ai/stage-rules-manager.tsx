'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type Stage = { id: string; name: string; orderIndex: number; criterion: string; enabled: boolean; example: string };
type Pipeline = { id: string; name: string; stages: Stage[] };

/** For each stage, in plain Portuguese, when the Flip AI should move the lead there. */
export function StageRulesManager({ initialPipelines }: { initialPipelines: Pipeline[] }) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [savingId, setSavingId] = useState<string | null>(null);

  const update = (stageId: string, patch: Partial<Stage>) => setPipelines((current) => current.map((pipeline) => ({
    ...pipeline,
    stages: pipeline.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
  })));

  async function save(stage: Stage) {
    setSavingId(stage.id);
    try {
      const response = await fetch('/api/whatsapp-ai/stage-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: stage.id, criterion: stage.criterion, enabled: stage.enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      toast.success(`Etapa "${stage.name}" salva.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSavingId(null);
    }
  }

  function fillExamples(pipeline: Pipeline) {
    setPipelines((current) => current.map((item) => (item.id !== pipeline.id ? item : {
      ...item,
      stages: item.stages.map((stage) => (!stage.criterion.trim() && stage.example ? { ...stage, criterion: stage.example, enabled: true } : stage)),
    })));
    toast.info('Exemplos preenchidos nas etapas vazias. Revise e salve cada etapa.');
  }

  if (!pipelines.length) return null;
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Etapas automáticas</h2>
        <p className="text-sm text-muted-foreground">
          A IA lê as etapas do funil pelo nome, entende o momento do lead na conversa do WhatsApp e sugere mover o lead (ou move sozinha, se o
          número estiver no modo automático). Um critério escrito aqui vale mais que o nome da etapa. Etapa desligada nunca é usada.
          A etapa final (venda) e etapas de tempo, como &quot;Não retorna&quot;, só com critério escrito. A IA não volta o lead para trás,
          exceto para &quot;Não qualificado&quot; ou &quot;Já é cliente&quot;.
        </p>
      </div>
      {pipelines.map((pipeline) => (
        <div key={pipeline.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Pipeline: {pipeline.name}</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => fillExamples(pipeline)}>Preencher com exemplos</Button>
          </div>
          {pipeline.stages.map((stage) => (
            <div key={stage.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{stage.orderIndex + 1}. {stage.name}</span>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={stage.enabled} onCheckedChange={(checked) => update(stage.id, { enabled: checked })} aria-label={`Usar a etapa ${stage.name}`} />
                  {stage.enabled ? 'Usada pela IA' : 'Não usada'}
                </label>
              </div>
              <textarea rows={2} className="w-full rounded border p-2 text-sm" placeholder="Ex.: a pessoa mandou todos os documentos pedidos."
                value={stage.criterion} onChange={(event) => update(stage.id, { criterion: event.target.value })} />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={savingId === stage.id} onClick={() => void save(stage)}>
                  {savingId === stage.id ? 'Salvando...' : 'Salvar etapa'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
