'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCpf, isValidCpf } from '@/lib/leads/cpf-rules';
import { toast } from 'sonner';
type Summary = { enabled: boolean; masked: string | null; sourceLabel: string | null; canEdit: boolean };
export function LeadCpfField({ leadId }: { leadId: string }) {
  return <CpfField key={leadId} leadId={leadId} />;
}
function CpfField({ leadId }: { leadId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = '/api/leads/'+encodeURIComponent(leadId)+'/cpf';
  async function load() {
    setFull(null);
    const res = await fetch(url, { cache: 'no-store' });
    setSummary(res.ok ? await res.json() : null);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', signal: controller.signal }).then(async res => {
      if (!controller.signal.aborted) setSummary(res.ok ? await res.json() : null);
    }).catch(() => {});
    return () => controller.abort();
  }, [url]);
  async function reveal() {
    if (full) { setFull(null); return; }
    setBusy(true);
    try {
      const res = await fetch(url+'?reveal=1', { cache: 'no-store' });
      if (!res.ok) throw Error();
      setFull((await res.json()).cpf || null);
    } catch { setFull(null); toast.error('Não foi possível mostrar o CPF.'); }
    finally { setBusy(false); }
  }
  async function save(value: string) {
    setBusy(true); setFull(null);
    try {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: value }) });
      if (!res.ok) throw Error();
      setEditing(false); setDraft(''); await load(); toast.success(value ? 'CPF salvo.' : 'CPF removido.');
    } catch { toast.error('Não foi possível salvar o CPF.'); }
    finally { setBusy(false); }
  }
  if (!summary?.enabled) return null;
  return <section className="space-y-2 rounded-xl border bg-white p-4">
    <h3 className="font-heading text-sm font-semibold">CPF do cliente</h3>
    <p className="font-mono text-sm">{full ? formatCpf(full) : summary.masked || 'Nenhum CPF cadastrado'}</p>
    {summary.sourceLabel && <p className="text-xs text-muted-foreground">{summary.sourceLabel}</p>}
    {summary.canEdit && (editing ? <div className="flex flex-wrap gap-2">
      <Input aria-label="CPF do cliente" autoComplete="off" inputMode="numeric" maxLength={14} value={draft} onChange={e=>setDraft(e.target.value)} />
      <Button type="button" disabled={busy || !isValidCpf(draft)} onClick={()=>void save(draft)}>Salvar</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(false);setDraft('');}}>Cancelar</Button>
    </div> : <div className="flex flex-wrap gap-2">
      {summary.masked && <Button type="button" variant="outline" disabled={busy} onClick={()=>void reveal()}>{full ? 'Ocultar' : 'Ver'}</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={()=>{setFull(null);setEditing(true);setDraft('');}}>{summary.masked ? 'Editar' : 'Adicionar'}</Button>
      {summary.masked && <Button type="button" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('Remover o CPF cadastrado?')) void save('');}}>Remover</Button>}
    </div>)}
  </section>;
}
