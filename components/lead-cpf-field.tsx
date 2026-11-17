'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Summary = { masked: string | null; sourceLabel: string | null; updatedAt: string | null; canEdit: boolean };

/**
 * The customer's CPF on the lead: masked by default; who may edit the lead can show the full number
 * (each view is recorded), correct it or clear it. Filled by the AI from the documents the customer
 * sends; a CPF the team writes is never replaced by the AI.
 */
export function LeadCpfField({ leadId }: { leadId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await fetch(`/api/leads/${leadId}/cpf`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setSummary(data);
    setFull(null);
  }
  useEffect(() => { void load(); }, [leadId]);

  async function reveal() {
    if (full) { setFull(null); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/cpf?reveal=1`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível mostrar o CPF.');
      setFull(data.cpf || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível mostrar o CPF.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/cpf`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: draft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o CPF.');
      toast.success(draft.trim() ? 'CPF salvo.' : 'CPF removido.');
      setEditing(false);
      setDraft('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o CPF.');
    } finally {
      setBusy(false);
    }
  }

  if (!summary) return null;
  const shown = full ? `${full.slice(0, 3)}.${full.slice(3, 6)}.${full.slice(6, 9)}-${full.slice(9)}` : summary.masked;
  return (
    <section className="space-y-2 rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">CPF do cliente</h3>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Guardado criptografado</span>
      </div>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{shown || 'Não informado'}</span>
          {summary.masked && summary.canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={() => void reveal()} disabled={busy} aria-label={full ? 'Ocultar CPF' : 'Mostrar CPF completo'}>
              {full ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              <span className="ml-1">{full ? 'Ocultar' : 'Mostrar'}</span>
            </Button>
          )}
          {summary.canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(true); setDraft(full || ''); }} disabled={busy}>
              {summary.masked ? 'Corrigir' : 'Informar CPF'}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`lead-cpf-${leadId}`} className="sr-only">CPF</label>
          <Input id={`lead-cpf-${leadId}`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} className="w-48" autoComplete="off" />
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(''); }} disabled={busy}>Cancelar</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {summary.sourceLabel
          ? `CPF ${summary.sourceLabel}. Se estiver errado, corrija: a IA nunca troca um CPF já informado.`
          : 'A IA preenche quando o cliente envia um documento com CPF. Deixe o campo vazio para remover.'}
      </p>
    </section>
  );
}
