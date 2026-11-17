'use client';

import { useEffect, useState } from 'react';
import { FileUp, Loader2, BookOpen } from 'lucide-react';

type Config = { title: string | null; source: string | null; version: number; updatedAt: string | null };
export function SupportKnowledgeConfig() {
  const [current, setCurrent] = useState<Config | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const refresh = async () => {
    const result = await fetch('/api/suporte-atendimento/config', { cache: 'no-store' });
    if (!result.ok) throw new Error('A configuração ainda não está disponível.');
    setCurrent(await result.json());
  };
  useEffect(() => {
    let cancelled = false;
    refresh().catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !current || saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('expectedVersion', String(current.version));
      const response = await fetch('/api/suporte-atendimento/config', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      await refresh();
      setFile(null);
      setSuccess(data.noop ? 'O arquivo já corresponde à revisão atual.' : 'Nova revisão do manual anexada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao anexar.');
    } finally { setSaving(false); }
  };

  return <div className="max-w-3xl space-y-6 p-6">
    <div className="flex items-center gap-3"><BookOpen className="h-6 w-6" /><h1 className="text-2xl font-semibold">Manual de suporte de atendimento</h1></div>
    <p className="text-sm text-muted-foreground">Uma base de conhecimento interna por empresa. Somente Dono e Administrador podem atualizar o arquivo; o time autorizado consulta no Inbox pelo botão Dúvidas.</p>
    <div className="rounded-lg border p-4 text-sm">
      {loading ? <p className="flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : current ? <>
        <p><strong>Revisão anexada:</strong> {current.version > 0 ? current.version : 'Nenhuma revisão enviada pelo painel'}</p>
        <p><strong>Origem atual:</strong> {current.source === 'pilot-repository' ? 'Manual piloto versionado no repositório' : current.source === 'tenant-upload' ? 'Arquivo privado da empresa' : 'Sem manual'}</p>
        {current.title && <p><strong>Identificação:</strong> {current.title}</p>}
        {current.updatedAt && <p><strong>Atualizado:</strong> {new Date(current.updatedAt).toLocaleString('pt-BR')}</p>}
      </> : null}
    </div>
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <label className="block text-sm font-medium" htmlFor="support-file">Anexar Markdown (.md) — até 1 MB</label>
      <input id="support-file" type="file" accept=".md,text/markdown,text/plain" className="block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      {file && <p className="text-xs text-muted-foreground">Selecionado: {file.name} ({file.size.toLocaleString('pt-BR')} bytes)</p>}
      <p className="text-xs text-muted-foreground">O envio cria uma nova versão privada. Revise o conteúdo antes de anexar. Não insira CPF, dados reais de clientes nem informações confidenciais desnecessárias.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="text-sm">{success}</p>}
      <button type="submit" disabled={!current || !file || saving || !/\.md$/i.test(file?.name || '') || (file?.size || 0) > 1_000_000}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {saving ? 'Salvando...' : 'Anexar nova revisão'}
      </button>
    </form>
  </div>;
}
