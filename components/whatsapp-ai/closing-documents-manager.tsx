'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CLOSING_MAX_TEMPLATES } from '@/lib/closing-documents/rules';

type Template = { id: string; name: string; sizeBytes: number; kind: 'pdf' | 'docx'; checklistIds: string[] };
type Checklist = { id: string; name: string };
type Pipeline = { id: string; name: string; stages: Array<{ id: string; name: string }> };
type State = {
  enabled: boolean; sendWhen: string; stageId: string | null; templates: Template[]; storageReady: boolean;
  checklists: Checklist[]; pipelines: Pipeline[];
};

const SEND_WHEN_EXAMPLE = 'Envie quando o cliente já tiver mandado o RG ou CNH, o CPF e o comprovante de residência, '
  + 'e tiver confirmado que quer seguir com o processo. Explique que são os documentos para formalizar o atendimento.';

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Case types a file is for, as checkboxes (none checked = every case). */
function CaseChoice(props: { checklists: Checklist[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (!props.checklists.length) return null;
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((item) => item !== id) : [...props.value, id]);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {props.checklists.map((checklist) => (
        <label key={checklist.id} className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={props.value.includes(checklist.id)} onChange={() => toggle(checklist.id)} />
          {checklist.name}
        </label>
      ))}
    </div>
  );
}

/**
 * "Documentos para finalizar o atendimento": the files the customer fills in and signs
 * (procuração, contrato, declarações), one set per case type, and the text that says when
 * the AI sends them. The files go as they are, with how to fill and sign them.
 */
export function ClosingDocumentsManager() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCases, setNewCases] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch('/api/whatsapp-ai/closing-documents', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.ready) return;
      setState({
        enabled: data.enabled, sendWhen: data.sendWhen, stageId: data.stageId ?? null, templates: data.templates,
        storageReady: data.storageReady, checklists: Array.isArray(data.checklists) ? data.checklists : [],
        pipelines: Array.isArray(data.pipelines) ? data.pipelines : [],
      });
    }).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  if (!state) return null;

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      newCases.forEach((id) => body.append('checklistId', id));
      const response = await fetch('/api/whatsapp-ai/closing-documents/templates', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
      toast.success('Documento enviado.');
      setNewCases([]);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove(template: Template) {
    if (!window.confirm(`Apagar o documento “${template.name}”?`)) return;
    const response = await fetch(`/api/whatsapp-ai/closing-documents/templates/${template.id}`, { method: 'DELETE' });
    if (!response.ok) toast.error('Não foi possível apagar.');
    load();
  }

  async function changeCases(template: Template, checklistIds: string[]) {
    setState((current) => (current
      ? { ...current, templates: current.templates.map((item) => (item.id === template.id ? { ...item, checklistIds } : item)) }
      : current));
    const response = await fetch(`/api/whatsapp-ai/closing-documents/templates/${template.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklistIds }),
    });
    if (!response.ok) { toast.error('Não foi possível mudar.'); load(); }
  }

  async function save(next: { enabled: boolean; sendWhen: string; stageId?: string | null }) {
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp-ai/closing-documents', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setState((current) => (current ? { ...current, ...next } : current));
      toast.success('Documentos de finalização salvos.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const full = state.templates.length >= CLOSING_MAX_TEMPLATES;
  const caseName = (id: string) => state.checklists.find((item) => item.id === id)?.name;

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Documentos para finalizar o atendimento</h2>
          <p className="text-sm text-muted-foreground">
            Os documentos que o cliente preenche e assina (procuração, contrato, declarações), em PDF. A IA manda na própria
            conversa, na hora que vocês explicarem abaixo, junto com o passo a passo para preencher e assinar (à mão ou pelo
            gov.br; menor de idade: assina o responsável; quem não sabe ou não consegue assinar: a rogo, com digital e 2 testemunhas).
          </p>
        </div>
        <Switch
          checked={state.enabled}
          disabled={saving}
          onCheckedChange={(enabled) => save({ enabled, sendWhen: state.sendWhen })}
          aria-label="Ligar documentos de finalização"
        />
      </div>

      {!state.storageReady && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">O armazenamento de arquivos não está configurado. Fale com o suporte.</p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Documentos</p>
        {state.templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>}
        {state.templates.map((template) => (
          <div key={template.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{template.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{template.kind.toUpperCase()} · {sizeLabel(template.sizeBytes)}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                {template.kind === 'docx' && (
                  <a
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                    href={`/api/whatsapp-ai/closing-documents/templates/${template.id}/sample`}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar exemplo
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(template)} aria-label={`Apagar ${template.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {template.checklistIds.length
                ? `Vai para: ${template.checklistIds.map(caseName).filter(Boolean).join(', ')}`
                : 'Vai para: todas as teses que não tiverem um documento próprio'}
            </p>
            <CaseChoice checklists={state.checklists} value={template.checklistIds} onChange={(ids) => changeCases(template, ids)} />
          </div>
        ))}
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">Para quais teses é o próximo documento? (nenhuma marcada = todas)</p>
          <CaseChoice checklists={state.checklists} value={newCases} onChange={setNewCases} />
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
          />
          <Button size="sm" variant="outline" disabled={full || uploading || !state.storageReady} onClick={() => fileInput.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> {uploading ? 'Enviando…' : full ? `Limite de ${CLOSING_MAX_TEMPLATES} documentos` : 'Enviar documento (PDF, até 4 MB)'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="closing-send-when" className="text-sm font-medium">Quando enviar</label>
        <textarea
          id="closing-send-when"
          className="min-h-[110px] w-full rounded-lg border p-3 text-sm"
          maxLength={2000}
          placeholder={SEND_WHEN_EXAMPLE}
          value={state.sendWhen}
          onChange={(event) => setState({ ...state, sendWhen: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          A IA lê este texto para decidir o momento e manda os documentos da tese do cliente. Quando o cliente devolver os
          documentos assinados, ela cria uma tarefa para a equipe conferir.
        </p>
        <label htmlFor="closing-stage" className="block pt-2 text-sm font-medium">Depois de enviar, mover o lead para a etapa</label>
        <select
          id="closing-stage"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={state.stageId ?? ''}
          onChange={(event) => setState({ ...state, stageId: event.target.value || null })}
        >
          <option value="">Não mover</option>
          {state.pipelines.map((pipeline) => (
            <optgroup key={pipeline.id} label={pipeline.name}>
              {pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Só para a frente, no mesmo funil do lead. As conversões do Meta e do Google seguem o que estiver configurado
          para essa etapa no Kanban.
        </p>
        <Button size="sm" disabled={saving} onClick={() => save({ enabled: state.enabled, sendWhen: state.sendWhen, stageId: state.stageId })}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </section>
  );
}
