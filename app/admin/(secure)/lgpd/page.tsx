'use client';

import { useEffect, useState } from 'react';

type Row = {
  id: string;
  type: 'export' | 'delete';
  status: 'pending' | 'in_review' | 'processed' | 'rejected' | 'cancelled';
  requestedAt: string;
  requester: { name: string; email: string } | null;
  tenant: { name: string; slug: string } | null;
  reason: string | null;
  note: string | null;
};

export default function AdminLgpdPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/lgpd', { cache: 'no-store' });
    const data = await res.json();
    setRows(data.requests || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(requestId: string, status: Row['status']) {
    const note = window.prompt('Observação interna (opcional):') || '';
    const res = await fetch('/api/admin/lgpd', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, status, note }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data?.error || 'Falha ao atualizar status');
    setMsg(`Solicitação atualizada para ${status}.`);
    load();
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">LGPD — solicitações</h1>
      <p className="text-sm text-muted-foreground">Acompanhe exportações e solicitações de exclusão sem expor dados sensíveis.</p>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="overflow-auto border rounded">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40"><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Solicitante</th><th className="p-2 text-left">Tenant</th><th className="p-2 text-left">Data</th><th className="p-2 text-left">Ações</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.type === 'export' ? 'Exportação' : 'Exclusão'}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.requester?.email || '—'}</td>
                  <td className="p-2">{r.tenant?.name || '—'}</td>
                  <td className="p-2">{new Date(r.requestedAt).toLocaleString('pt-BR')}</td>
                  <td className="p-2 space-x-2">
                    <button className="px-2 py-1 border rounded" onClick={() => setStatus(r.id, 'in_review')}>Em análise</button>
                    <button className="px-2 py-1 border rounded" onClick={() => setStatus(r.id, 'processed')}>Processada</button>
                    <button className="px-2 py-1 border rounded" onClick={() => setStatus(r.id, 'rejected')}>Rejeitar</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Sem solicitações LGPD.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
