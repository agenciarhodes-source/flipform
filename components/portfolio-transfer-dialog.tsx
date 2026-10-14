'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type Attendant = { id: string; name: string; active: boolean; openLeads: number };

/** Lets a manager hand all open leads of one attendant to another. Hidden for anyone else. */
export function PortfolioTransferDialog({ onDone }: { onDone?: () => void }) {
  const [attendants, setAttendants] = useState<Attendant[] | null>(null);
  const [open, setOpen] = useState(false);
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch('/api/leads/transfer-portfolio', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) { setAttendants(null); return; }
    const data = await response.json().catch(() => ({}));
    setAttendants(Array.isArray(data.attendants) ? data.attendants : []);
  };
  useEffect(() => { void load(); }, []);

  if (!attendants || attendants.length < 2) return null;
  const from = attendants.find((attendant) => attendant.id === fromUserId);

  async function transfer() {
    if (!fromUserId || !toUserId || fromUserId === toUserId || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/leads/transfer-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId, toUserId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível transferir a carteira.');
      toast.success(`${data.leads} lead(s) e ${data.conversations} conversa(s) de ${data.from} passaram para ${data.to}.`);
      setOpen(false);
      setFromUserId('');
      setToUserId('');
      await load();
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível transferir a carteira.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ArrowRightLeft className="w-4 h-4 mr-1" />Transferir carteira
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir carteira</DialogTitle>
            <DialogDescription>
              Passa todos os leads em aberto de um atendente para outro, com as conversas e todo o histórico. Leads ganhos ou perdidos continuam com quem estavam.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block" htmlFor="portfolio-from">De
              <select id="portfolio-from" value={fromUserId} onChange={(event) => setFromUserId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3">
                <option value="">Escolha o atendente</option>
                {attendants.map((attendant) => (
                  <option key={attendant.id} value={attendant.id}>
                    {attendant.name} ({attendant.openLeads} em aberto){attendant.active ? '' : ' (inativo)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="portfolio-to">Para
              <select id="portfolio-to" value={toUserId} onChange={(event) => setToUserId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3">
                <option value="">Escolha o atendente</option>
                {attendants.filter((attendant) => attendant.active && attendant.id !== fromUserId).map((attendant) => (
                  <option key={attendant.id} value={attendant.id}>{attendant.name}</option>
                ))}
              </select>
            </label>
            {from ? <p className="text-xs text-muted-foreground">Para parar de receber leads novos, pause também o atendente em Rodízio de leads.</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={() => void transfer()} disabled={saving || !fromUserId || !toUserId}>
              {saving ? 'Transferindo...' : `Transferir ${from ? `${from.openLeads} lead(s)` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
