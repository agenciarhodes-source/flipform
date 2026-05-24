'use client';
import { useState } from 'react';

export default function LgpdClient() {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function requestDelete() {
    setErr(null); setMsg(null);
    const res = await fetch('/api/account/delete-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, confirmation }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data?.error || 'Falha ao registrar solicitação.');
    else setMsg(data?.message || 'Solicitação registrada.');
  }

  return <div className="rounded border p-4 space-y-4"><div><div className="font-medium">Exportar dados</div><p className="text-sm text-muted-foreground">Baixe uma cópia dos dados do seu tenant em formato JSON.</p><a className="inline-block mt-2 px-3 py-2 border rounded text-sm" href="/api/account/export">Baixar exportação</a></div><div><div className="font-medium">Solicitar exclusão da conta</div><p className="text-sm text-muted-foreground">A exclusão não é imediata e será revisada manualmente.</p><textarea className="w-full border rounded p-2 text-sm mt-2" rows={3} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} /><input className="w-full border rounded p-2 text-sm mt-2" placeholder="Digite EXCLUIR para confirmar" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /><button className="mt-2 px-3 py-2 border rounded text-sm" onClick={requestDelete}>Solicitar exclusão</button></div>{msg && <div className="text-emerald-700 text-sm">{msg}</div>}{err && <div className="text-rose-700 text-sm">{err}</div>}</div>;
}
