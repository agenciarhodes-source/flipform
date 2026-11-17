'use client';

import { useEffect, useState } from 'react';
import { BookOpenText, Download, FileUp, LifeBuoy, Loader2, PencilLine } from 'lucide-react';

type Config = { title: string | null; source: string | null; version: number; updatedAt: string | null };
const MAX_BYTES = 1_000_000;

export function SupportKnowledgeConfig() {
  const [current, setCurrent] = useState<Config | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
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
    const response = await fetch('/api/suporte-atendimento/knowledge', { cache: 'no-store' });
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

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || saving) return;
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
      setSuccess(data.noop ? 'O arquivo já corresponde à revisão atual.' : 'Nova revisão privada do manual publicada para sua equipe.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao anexar o manual.');
    } finally { setSaving(false); }
  };

  const canSubmit = Boolean(current && !loading && !saving && (
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
        Somente Dono e Administrador podem atualizar; o time autorizado consulta no botão Suporte do Inbox ou Direct.
        O JEV, quando aprovado e habilitado, apenas identifica os capítulos pertinentes.
      </p>

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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="text-sm">{success}</p>}
        <button type="submit" disabled={!canSubmit}
          className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Publicar revisão'}
        </button>
      </form>
    </div>
  );
}
