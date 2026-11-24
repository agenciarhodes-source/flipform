'use client';

import { useEffect, useState } from 'react';
import { BookOpenText, Download, FileUp, LifeBuoy, Loader2, PencilLine } from 'lucide-react';

type Config = { title: string | null; source: string | null; version: number; updatedAt: string | null; enabled: boolean; activationRevision: number };
const MAX_BYTES = 1_000_000;

export function SupportKnowledgeConfig() {
  const [current, setCurrent] = useState<Config | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = async () => {
    const response = await fetch('/api/suporte-atendimento/config', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a configuração.');
    setCurrent(data as Config);
  };

  useEffect(() => {
    let cancelled = false;
    refresh().catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function getPrivateMarkdown() {
    const response = await fetch('/api/suporte-atendimento/config?includeContent=1', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.content !== 'string') {
      throw new Error(data.error || 'A revisão atual não está disponível.');
    }
    return data.content as string;
  }

  async function openEditor() {
    setError('');
    if (editorVisible) { setEditorVisible(false); return; }
    setLoadingCurrent(true);
    try {
      const text = current && current.version > 0 ? await getPrivateMarkdown() : '# Manual de Suporte — Nome da Empresa\n\n## Informações da empresa\n\n## Perguntas frequentes\n\n## Procedimentos internos\n\n';
      setMarkdown(text);
      setFile(null);
      setEditorVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o Markdown para edição.');
    } finally { setLoadingCurrent(false); }
  }

  async function downloadCurrent() {
    setError('');
    try {
      const text = await getPrivateMarkdown();
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'suporte-manual-da-empresa.md';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar o Markdown.');
    }
  }

  const toggleSupport = async () => {
    if (!current || switching || saving) return;
    setError(''); setSuccess(''); setSwitching(true);
    try {
      const nextEnabled = !current.enabled;
      const response = await fetch('/api/suporte-atendimento/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, expectedRevision: current.activationRevision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar o Suporte.');
      await refresh();
      setSuccess(nextEnabled
        ? 'Suporte ligado: os atendentes desta empresa já podem consultar o manual.'
        : 'Suporte desligado: o manual continua salvo e editável.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar a configuração.');
    } finally { setSwitching(false); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || saving || switching) return;
    setError(''); setSuccess('');
    const bodyFile = file || (editorVisible && markdown.trim().length >= 50
      ? new File([markdown], 'suporte-empresa.md', { type: 'text/markdown' }) : null);
    if (!bodyFile || bodyFile.size > MAX_BYTES) { setError('Selecione ou escreva um arquivo Markdown válido com até 1 MB.'); return; }
    setSaving(true);
    try {
      const body = new FormData();
      body.set('file', bodyFile);
      body.set('expectedVersion', String(current.version));
      const response = await fetch('/api/suporte-atendimento/config', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível anexar o manual.');
      await refresh();
      setFile(null);
      setEditorVisible(false);
      setMarkdown('');
      setSuccess(data.noop ? 'O arquivo já corresponde à revisão atual.' : 'Manual salvo na base privada. A disponibilidade para atendentes depende do botão liga/desliga.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao anexar o manual.');
    } finally { setSaving(false); }
  };

  const canSubmit = Boolean(current && !loading && !saving && !switching && (
    file && file.size > 0 && file.size <= MAX_BYTES ||
    editorVisible && markdown.trim().length >= 50 && new Blob([markdown]).size <= MAX_BYTES
  ));

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <LifeBuoy aria-hidden="true" className="h-7 w-7 text-orange-500" />
        <div><h1 className="text-2xl font-semibold">Suporte</h1><p className="text-sm text-muted-foreground">Manual interno da empresa</p></div>
      </div>

      <p className="text-sm text-muted-foreground">
        Anexe um arquivo Markdown ou escreva o conteúdo aqui. O material é privado e separado por empresa.
        Somente o Proprietário pode configurar e publicar o manual. O Suporte será mostrado apenas para o perfil Atendente no Inbox ou Direct.
        O Suporte começa desligado e precisa ser ativado por você. O JEV, quando aprovado e habilitado, apenas identifica os capítulos pertinentes.
      </p>

      <section aria-label="Ativação do Suporte" className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold">Ativar Suporte para os atendentes</h2>
            <p className="text-sm text-muted-foreground">
              {current?.enabled ? 'Ligado — disponível para os atendentes desta empresa.' : 'Desligado — não aparece para os atendentes.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Ativar Suporte para os atendentes"
            aria-checked={Boolean(current?.enabled)}
            disabled={!current || loading || switching || saving || (!current.enabled && current.version === 0)}
            onClick={() => void toggleSupport()}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${current?.enabled ? 'bg-orange-500' : 'bg-muted-foreground/40'}`}
          >
            <span aria-hidden="true" className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${current?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {!current?.enabled && current?.version === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Publique um arquivo Markdown primeiro para habilitar este botão.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Cada empresa controla seu próprio estado. Desligar não exclui o arquivo nem muda as configurações do JEV.
        </p>
        {switching && <p role="status" className="mt-2 text-xs text-muted-foreground">Salvando o estado...</p>}
      </section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="text-sm">{success}</p>}

      <div className="space-y-2 rounded-lg border p-4 text-sm">
        {loading ? <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando configuração...</p>
          : current ? <>
            <p><strong>Revisão atual:</strong> {current.version > 0 ? current.version : 'Nenhum manual cadastrado'}</p>
            <p><strong>Origem:</strong> {current.source === 'tenant-upload' ? 'Arquivo privado da empresa' : 'Aguardando cadastro'}</p>
            {current.title && <p className="break-words"><strong>Título:</strong> {current.title}</p>}
            {current.updatedAt && <p><strong>Atualizado:</strong> {new Date(current.updatedAt).toLocaleString('pt-BR')}</p>}
            {current.version > 0 && <button type="button" onClick={() => void downloadCurrent()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> Baixar Markdown atual
            </button>}
          </> : null}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <label htmlFor="support-file" className="block text-sm font-medium">Anexar arquivo .md</label>
          <input id="support-file" type="file" accept=".md,text/markdown,text/plain"
            className="block w-full text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              if (event.target.files?.[0]) setEditorVisible(false);
            }} />
          {file && <p className="text-xs text-muted-foreground">{file.name} — {file.size.toLocaleString('pt-BR')} bytes</p>}
        </div>

        <div className="border-t pt-4">
          <button type="button" disabled={loadingCurrent || !current || saving} onClick={() => void openEditor()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            {loadingCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            {editorVisible ? 'Fechar editor' : current && current.version > 0 ? 'Editar Markdown cadastrado' : 'Escrever ou colar Markdown'}
          </button>
          {editorVisible && <div className="mt-3 space-y-2">
            <label htmlFor="support-markdown" className="flex items-center gap-2 text-sm font-medium">
              <BookOpenText className="h-4 w-4" /> Conteúdo do manual
            </label>
            <textarea id="support-markdown" value={markdown} rows={15} spellCheck={false}
              onChange={(event) => { setMarkdown(event.target.value); setFile(null); }}
              className="w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">Seu texto substitui o conteúdo da revisão corrente apenas quando clicar em Publicar revisão.</p>
          </div>}
        </div>

        <p className="text-xs text-muted-foreground">
          Limite: 1 MB por manual. Revise o conteúdo com o responsável antes de publicar.
          Não insira informações pessoais de clientes, senhas, códigos ou dados bancários.
        </p>
        <button type="submit" disabled={!canSubmit}
          className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Publicar revisão'}
        </button>
      </form>
    </div>
  );
}
