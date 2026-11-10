'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CLOSING_MAX_TEMPLATES } from '@/lib/closing-documents/rules';

type Template = { id: string; name: string; sizeBytes: number; known: string[]; unknown: string[] };
type Field = { key: string; label: string };
type State = { enabled: boolean; sendWhen: string; templates: Template[]; storageReady: boolean; fields: Field[] };

const SEND_WHEN_EXAMPLE = 'Envie quando o cliente já tiver mandado o RG ou CNH, o CPF e o comprovante de residência, '
  + 'e tiver confirmado que quer seguir com o processo. Explique que são os documentos para formalizar o atendimento.';

/**
 * "Documentos para finalizar o atendimento": up to 3 Word models, the same for every customer,
 * filled with the customer's data, and the text that says when they are sent.
 */
export function ClosingDocumentsManager() {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch('/api/whatsapp-ai/closing-documents', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.ready) return;
      setState({ enabled: data.enabled, sendWhen: data.sendWhen, templates: data.templates, storageReady: data.storageReady, fields: data.fields });
    }).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  if (!state) return null;

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/whatsapp-ai/closing-documents/templates', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o modelo.');
      if (data.unknown?.length) toast.warning(`O sistema não sabe preencher: ${data.unknown.map((n: string) => `{{${n}}}`).join(', ')}.`);
      else toast.success('Modelo enviado.');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o modelo.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove(template: Template) {
    if (!window.confirm(`Apagar o modelo “${template.name}”?`)) return;
    const response = await fetch(`/api/whatsapp-ai/closing-documents/templates/${template.id}`, { method: 'DELETE' });
    if (!response.ok) toast.error('Não foi possível apagar.');
    load();
  }

  async function save(next: { enabled: boolean; sendWhen: string }) {
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

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Documentos para finalizar o atendimento</h2>
          <p className="text-sm text-muted-foreground">
            Até {CLOSING_MAX_TEMPLATES} modelos em Word, iguais para todos os clientes. O sistema preenche com os dados que o cliente
            mandou (nome, CPF, endereço…) e envia na hora que vocês explicarem abaixo.
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
        <p className="text-sm font-medium">Modelos</p>
        {state.templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo enviado ainda.</p>}
        {state.templates.map((template) => (
          <div key={template.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{template.name}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <a
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                  href={`/api/whatsapp-ai/closing-documents/templates/${template.id}/sample`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar exemplo preenchido
                </a>
                <Button size="sm" variant="ghost" onClick={() => remove(template)} aria-label={`Apagar ${template.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {template.known.length
                ? <>Preenche: {template.known.map((name) => `{{${name}}}`).join(', ')}</>
                : 'Nenhum campo {{ }} encontrado: o documento vai do jeito que está.'}
            </p>
            {template.unknown.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Não sei preencher: {template.unknown.map((name) => `{{${name}}}`).join(', ')}. Use um dos nomes da lista abaixo.
              </p>
            )}
          </div>
        ))}
        <input
          ref={fileInput}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
        />
        <Button size="sm" variant="outline" disabled={full || uploading || !state.storageReady} onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1 h-4 w-4" /> {uploading ? 'Enviando…' : full ? `Limite de ${CLOSING_MAX_TEMPLATES} modelos` : 'Enviar modelo (.docx)'}
        </Button>
      </div>

      <details className="rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Como marcar os dados do cliente no modelo</summary>
        <p className="mt-2 text-muted-foreground">
          No Word, escreva o nome do campo entre chaves duplas onde o dado deve entrar, por exemplo: “Eu, {'{{NOME COMPLETO}}'},
          inscrita no CPF {'{{CPF}}'}, residente em {'{{ENDEREÇO}}'}…”.
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {state.fields.map((field) => (
            <li key={field.key}><code className="rounded bg-white px-1">{`{{${field.key}}}`}</code> <span className="text-muted-foreground">{field.label}</span></li>
          ))}
        </ul>
      </details>

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
          A IA lê este texto para decidir o momento. Se faltar algum dado do cliente (por exemplo, o CPF), ela pede antes de enviar.
          Nada sai com campo em branco.
        </p>
        <Button size="sm" disabled={saving} onClick={() => save({ enabled: state.enabled, sendWhen: state.sendWhen })}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </section>
  );
}
