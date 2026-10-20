'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DOCUMENT_CHECKLIST_EXAMPLES } from '@/lib/whatsapp-ai/document-rules';

type Checklist = { id: string | null; name: string; itemsText: string; enabled: boolean };

/** The documents each type of case needs, one per line, with an optional rule after "|". */
export function DocumentChecklistsManager({ initial }: { initial: Array<Omit<Checklist, 'id'> & { id: string }> }) {
  const [lists, setLists] = useState<Checklist[]>(initial);
  const [saving, setSaving] = useState<number | null>(null);
  const update = (index: number, patch: Partial<Checklist>) => setLists((current) => current.map((list, at) => (at === index ? { ...list, ...patch } : list)));

  async function save(index: number) {
    const list = lists[index];
    setSaving(index);
    try {
      const response = await fetch('/api/whatsapp-ai/document-checklists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      update(index, { id: data.id, itemsText: data.itemsText });
      toast.success(`Lista "${list.name}" salva.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(null);
    }
  }

  function addExamples() {
    const names = new Set(lists.map((list) => list.name.toLowerCase()));
    const examples = DOCUMENT_CHECKLIST_EXAMPLES.filter((example) => !names.has(example.name.toLowerCase()))
      .map((example) => ({ id: null, name: example.name, itemsText: example.items, enabled: true }));
    setLists((current) => [...current, ...examples]);
    toast.info('Exemplos adicionados. Ajuste, salve os que servem e desligue os que não servem.');
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Documentos</h2>
        <p className="text-sm text-muted-foreground">
          Os documentos que cada tipo de caso precisa. A IA descobre o caso pela conversa, pede os documentos, confere cada foto ou PDF
          (qual documento é, se está legível e se cumpre a regra) e cobra o que falta. Os arquivos ficam só no WhatsApp (a Meta guarda por 30 dias);
          o FlipForm guarda apenas o resultado da conferência.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Um documento por linha. Para uma regra, use “|”: <em>Comprovante de residência | dos últimos 3 meses</em>.</p>
      </div>
      {lists.map((list, index) => (
        <div key={list.id || `new-${index}`} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="min-w-0 flex-1 rounded border p-2 text-sm font-medium" value={list.name} placeholder="Tipo de caso"
              onChange={(event) => update(index, { name: event.target.value })} />
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={list.enabled} onCheckedChange={(checked) => update(index, { enabled: checked })} aria-label={`Usar a lista ${list.name}`} />
              {list.enabled ? 'Em uso' : 'Desligada'}
            </label>
          </div>
          <textarea rows={5} className="w-full rounded border p-2 text-sm" value={list.itemsText}
            onChange={(event) => update(index, { itemsText: event.target.value })} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{list.id ? 'Salva' : 'Ainda não salva'}</span>
            <Button type="button" size="sm" disabled={saving === index} onClick={() => void save(index)}>{saving === index ? 'Salvando...' : 'Salvar lista'}</Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLists((current) => [...current, { id: null, name: '', itemsText: '', enabled: true }])}>Nova lista</Button>
        <Button type="button" variant="outline" size="sm" onClick={addExamples}>Adicionar exemplos</Button>
      </div>
    </section>
  );
}
