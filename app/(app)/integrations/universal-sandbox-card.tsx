'use client';
import { useEffect, useRef, useState } from 'react';
import { SYSTEM_CATEGORIES } from '@/lib/universal-connectors/catalog';

type Connection = { id: string; revokedAt: string | null };
const endpoint = '/api/integrations/universal-sandbox';
export function UniversalSandboxCard() {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Connection[]>([]);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function refresh() {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) { setAvailable(false); return; }
      const body = await res.json();
      setRows(body.connections); setAvailable(true);
    } catch { setAvailable(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function act(action: 'test' | 'connect' | 'disconnect', id?: string) {
    if (busy) return;
    const secret = input.current?.value ?? '';
    if (action !== 'disconnect' && !secret) { setMessage('Informe uma chave do sandbox.'); return; }
    if (action === 'disconnect' && !window.confirm('Remover a credencial local? A chave no Asaas não será revogada.')) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'disconnect' ? { action, id } : { action, secret }), cache: 'no-store' });
      const result = await res.json();
      setMessage(res.ok ? result.message ?? 'Credencial local removida.' : result.error ?? 'Operação não concluída.');
      if (res.ok) { if (input.current) input.current.value = ''; await refresh(); }
    } catch { setMessage('Operação não concluída.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-card p-5 space-y-4" aria-label="Catálogo de sistemas">
    <div><h2 className="text-xl font-semibold">Catálogo de sistemas</h2>
      <p className="text-sm text-muted-foreground">Universal Connect · piloto restrito ao ambiente de testes. Nenhuma sincronização ativa.</p></div>
    <div className="flex flex-wrap gap-2">{SYSTEM_CATEGORIES.map(name => <span key={name} className="rounded-full border px-3 py-1 text-xs">{name}</span>)}</div>
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Asaas — Sandbox</h3>
      <p className="text-sm text-muted-foreground">Use exclusivamente uma chave da conta de teste. O teste verifica aceitação da credencial, não a titularidade da conta.</p>
      {available ? <>
        <label className="block text-sm" htmlFor="uc-sandbox-key">Chave de API de teste</label>
        <input id="uc-sandbox-key" ref={input} type="password" autoComplete="off" maxLength={2048} className="w-full rounded-md border bg-background p-2" disabled={busy}/>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void act('test')} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Testar</button>
          <button type="button" disabled={busy} onClick={() => void act('connect')} className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">Testar e salvar</button>
        </div>
        {rows.filter(row => !row.revokedAt).map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-t pt-2 text-sm">
          <span>Credencial de teste salva · sincronização desativada</span>
          <button type="button" disabled={busy} onClick={() => void act('disconnect', row.id)} className="rounded-md border px-3 py-2 disabled:opacity-50">Desconectar localmente</button>
        </div>)}
      </> : <p className="text-sm text-muted-foreground">Acesso indisponível neste ambiente ou para este usuário.</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
    <p className="text-sm text-muted-foreground">Bearer Token, OAuth e os demais provedores aguardam homologação específica.</p>
  </section>;
}
