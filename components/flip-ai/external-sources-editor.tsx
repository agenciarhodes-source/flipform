'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Globe2, LoaderCircle, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AgentDraft, FlipAiExternalSource } from '@/lib/flip-ai/policy';

export function ExternalSourcesEditor({ agent, onClose }: { agent: AgentDraft; onClose: () => void }) {
  const [sources, setSources] = useState<FlipAiExternalSource[]>([]);
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const createAttempt = useRef<{ key: string; requestId: string } | null>(null);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/external-sources`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as fontes.');
      setSources(data.sources);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { void load(); }, [agent.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const input = { label: label.trim(), domain: domain.trim() };
    const key = JSON.stringify(input);
    const attempt = createAttempt.current?.key === key
      ? createAttempt.current : { key, requestId: crypto.randomUUID() };
    createAttempt.current = attempt;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/external-sources`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: attempt.requestId, ...input }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível cadastrar a fonte.');
      setSources((current) => [...current.filter((item) => item.id !== data.source.id), data.source]);
      createAttempt.current = null;
      setLabel(''); setDomain(''); setMessage('Domínio autorizado salvo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function toggle(source: FlipAiExternalSource) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/external-sources/${source.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: source.label, status: source.status === 'active' ? 'inactive' : 'active', version: source.version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar a fonte.');
      setSources((current) => current.map((item) => item.id === data.source.id ? data.source : item));
      setMessage(data.source.status === 'active' ? 'Fonte ativada.' : 'Fonte desativada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Atualize a lista para conferir o estado.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="rounded-lg border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-medium"><Globe2 className="h-5 w-5" />Fontes externas de {agent.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Autorize somente sites confiáveis. Informe apenas o domínio, sem https:// ou caminho.</p></div>
      <Button variant="outline" onClick={onClose} disabled={busy}>Fechar</Button>
    </div>
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Cadastrar um domínio não ativa busca na internet. A execução será conectada em uma etapa posterior, com cache, limites e registro das fontes.
    </div>
    <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm">Nome da fonte<Input className="mt-1" value={label} onChange={(event) => setLabel(event.target.value)}
        required minLength={2} maxLength={80} placeholder="Site oficial" disabled={busy} /></label>
      <label className="text-sm">Domínio<Input className="mt-1" value={domain} onChange={(event) => setDomain(event.target.value)}
        required minLength={3} maxLength={253} placeholder="empresa.com.br" disabled={busy} /></label>
      <Button type="submit" className="self-end" disabled={busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Autorizar'}</Button>
    </form>
    <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>
    <ul className="mt-4 space-y-2">
      {sources.map((source) => <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="min-w-0"><p className="font-medium">{source.label}</p><p className="break-all text-xs text-muted-foreground">{source.domain}</p></div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void toggle(source)}>
          <Power className="mr-2 h-4 w-4" />{source.status === 'active' ? 'Desativar' : 'Ativar'}
        </Button>
      </li>)}
      {!busy && !sources.length ? <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhuma fonte externa autorizada.</li> : null}
    </ul>
  </section>;
}
