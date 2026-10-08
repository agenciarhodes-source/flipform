'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CatalogModel = {
  id: string;
  label: string;
  description: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function FlipAiTextModelCard() {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [source, setSource] = useState<string>('default');
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/openai/text-model', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      setModels(payload.models || []);
      setActiveModel(payload.active?.model || null);
      setSource(payload.active?.source || 'default');
      setSelected(payload.active?.model || '');
    } catch {
      toast.error('Não foi possível carregar o modelo ativo do Flip AI.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const target = models.find((model) => model.id === selected);
    if (!target || selected === activeModel) return;
    if (!window.confirm(`Ativar ${target.label} para as conversas de todos os clientes?`)) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/openai/text-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      setActiveModel(payload.active.model);
      setSource(payload.active.source);
      toast.success(`${target.label} ativado. Novas conversas passam a usar este modelo em até 30 segundos.`);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar o modelo ativo.');
    } finally {
      setSaving(false);
    }
  };

  const activeIsListed = models.some((model) => model.id === activeModel);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-heading font-semibold">Modelo ativo do Flip AI</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Modelo de texto usado nas conversas dos atendentes de todos os clientes. A troca vale para novas respostas; os
          clientes continuam vendo apenas créditos.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="space-y-2">
            {models.map((model) => (
              <label key={model.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected === model.id ? 'border-blue-400 bg-blue-50/50' : ''}`}>
                <input
                  type="radio"
                  name="flip-ai-text-model"
                  className="mt-1"
                  checked={selected === model.id}
                  onChange={() => setSelected(model.id)}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{model.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
                    {activeModel === model.id && (
                      <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">Ativo</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{model.description}</p>
                  <p className="mt-1 text-xs">
                    Entrada {usd.format(model.inputUsdPerMillion)} · Saída {usd.format(model.outputUsdPerMillion)} por 1 milhão de tokens
                  </p>
                </div>
              </label>
            ))}
          </div>

          {!activeIsListed && activeModel && (
            <p className="text-xs text-amber-700">
              O modelo em uso ({activeModel}) vem da configuração do servidor e não está nesta lista. Se ele não tiver preço
              cadastrado, o consumo não é descontado das carteiras.
            </p>
          )}
          {source === 'default' && activeIsListed && (
            <p className="text-xs text-muted-foreground">Em uso pelo padrão do servidor; nenhuma escolha foi salva neste painel ainda.</p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !selected || selected === activeModel}>
              {saving ? 'Salvando...' : 'Ativar modelo selecionado'}
            </Button>
            <span className="text-xs text-muted-foreground">A troca é registrada na auditoria.</span>
          </div>
        </>
      )}
    </Card>
  );
}
