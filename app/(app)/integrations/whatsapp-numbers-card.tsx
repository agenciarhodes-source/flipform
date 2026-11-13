'use client';

import { useCallback, useEffect, useState } from 'react';

type WhatsAppNumber = { id: string; label: string | null; displayPhoneNumber: string | null; verifiedName: string | null; userIds: string[] };
type Member = { userId: string; role: string; name: string; email: string };

export const WHATSAPP_NUMBERS_CHANGED = 'flipform:whatsapp-numbers-changed';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', manager: 'Gestor', agent: 'Atendente', viewer: 'Visualizador' };

/**
 * The company's WhatsApp numbers: a name for each one, who sees each one in the Inbox, and
 * disconnecting one number alone.
 */
export function WhatsAppNumbersCard() {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [accessReady, setAccessReady] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [accessDrafts, setAccessDrafts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/integrations/whatsapp/numbers', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    const list: WhatsAppNumber[] = data.numbers || [];
    setNumbers(list);
    setTeam(data.team || []);
    setAccessReady(data.accessReady !== false);
    setDrafts(Object.fromEntries(list.map((item) => [item.id, item.label || ''])));
    setAccessDrafts(Object.fromEntries(list.map((item) => [item.id, item.userIds || []])));
  }, []);

  useEffect(() => {
    load();
    const refresh = () => { load(); };
    window.addEventListener(WHATSAPP_NUMBERS_CHANGED, refresh);
    return () => window.removeEventListener(WHATSAPP_NUMBERS_CHANGED, refresh);
  }, [load]);

  async function send(method: 'PATCH' | 'PUT', body: unknown, id: string, done: string) {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/numbers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setMessage(done);
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(item: WhatsAppNumber) {
    const name = item.label || item.displayPhoneNumber || 'este número';
    if (!window.confirm(`Desconectar ${name}? Os outros números continuam conectados. As conversas e o histórico deste número ficam guardados.`)) return;
    setBusy(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/integrations/whatsapp/connection?connectionId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível desconectar.');
      window.dispatchEvent(new Event(WHATSAPP_NUMBERS_CHANGED));
      setMessage(`${name} desconectado.`);
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível desconectar.');
    } finally {
      setBusy(null);
    }
  }

  function toggle(numberId: string, userId: string) {
    setAccessDrafts((current) => {
      const list = current[numberId] || [];
      return { ...current, [numberId]: list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId] };
    });
  }

  if (numbers.length === 0) return null;
  const several = numbers.length > 1;
  return <div className="rounded-lg border bg-white p-5 space-y-3">
    <div>
      <h3 className="font-semibold">Números de WhatsApp da empresa</h3>
      <p className="text-sm text-muted-foreground">Dê um nome a cada número (por exemplo, &quot;Tráfego pago&quot; ou &quot;Carteira&quot;). Cada conversa é respondida pelo número em que chegou.</p>
      {several && <p className="text-sm text-muted-foreground mt-1">Em <strong>Quem vê este número</strong>, marque as pessoas de cada número. Quem não estiver marcado em nenhum número vê todos. O proprietário sempre vê todos e distribui as conversas.</p>}
    </div>
    {message && <div className="rounded-md border bg-muted/30 p-2 text-sm">{message}</div>}
    <div className="divide-y rounded-md border">
      {numbers.map((item) => {
        const savedAccess = [...(item.userIds || [])].sort().join(',');
        const draftAccess = [...(accessDrafts[item.id] || [])].sort().join(',');
        return (
          <div key={item.id} className="p-3 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.displayPhoneNumber || 'Número'}</div>
                <div className="text-xs text-muted-foreground truncate">{item.verifiedName || ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="h-9 w-48 rounded-md border px-3 text-sm"
                  value={drafts[item.id] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="Nome do número"
                  maxLength={40}
                  disabled={busy === item.id}
                  aria-label={`Nome do número ${item.displayPhoneNumber || ''}`}
                />
                <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-60" onClick={() => send('PATCH', { connectionId: item.id, label: drafts[item.id] || null }, item.id, 'Nome do número salvo.')} disabled={busy === item.id || (drafts[item.id] ?? '') === (item.label || '')}>Salvar nome</button>
                {several && <button type="button" className="px-3 py-2 rounded border text-sm text-rose-700 disabled:opacity-60" onClick={() => disconnect(item)} disabled={busy === item.id}>Desconectar</button>}
              </div>
            </div>
            {several && accessReady && (
              <div className="rounded-md bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-medium">Quem vê este número</div>
                {team.length === 0
                  ? <div className="text-xs text-muted-foreground">Nenhuma pessoa da equipe além do proprietário.</div>
                  : <div className="grid gap-1 sm:grid-cols-2">
                    {team.map((member) => (
                      <label key={member.userId} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={(accessDrafts[item.id] || []).includes(member.userId)} onChange={() => toggle(item.id, member.userId)} disabled={busy === item.id} />
                        <span className="truncate">{member.name} <span className="text-xs text-muted-foreground">· {ROLE_LABEL[member.role] || member.role}</span></span>
                      </label>
                    ))}
                  </div>}
                <button type="button" className="px-3 py-1.5 rounded border text-sm disabled:opacity-60" onClick={() => send('PUT', { connectionId: item.id, userIds: accessDrafts[item.id] || [] }, item.id, 'Acesso ao número salvo.')} disabled={busy === item.id || savedAccess === draftAccess}>Salvar acesso</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>;
}
