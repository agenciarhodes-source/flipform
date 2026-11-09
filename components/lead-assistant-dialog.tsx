'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LEAD_ASSISTANT_EXAMPLES } from '@/lib/lead-assistant/rules';

type Recent = { id: string; at: string; by: string | null; command: string; moves: number; undone: boolean };
type Context = { attendants: Array<{ id: string; name: string; active: boolean; openLeads: number }>; unassigned: number; recent: Recent[] };
type Distribution = {
  kind: 'distribution';
  plan: unknown;
  scopeText: string;
  modeText: string;
  targetsText: string;
  chosen: number;
  moves: number;
  targets: Array<{ id: string; name: string; before: number; receives: number; losesInside: number; after: number }>;
  from: Array<{ name: string; count: number }>;
};
type Preview =
  | Distribution
  | { kind: 'report'; title: string; rows: Array<{ name: string; count: number }> }
  | { kind: 'unsupported'; message: string };

const when = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/**
 * "Assistente de leads": a manager writes a command, sees a preview and confirms. Only the
 * responsible person of open leads in the Kanban changes, and every change can be undone.
 * Hidden for anyone who cannot edit every lead.
 */
export function LeadAssistantDialog({ onDone }: { onDone?: () => void }) {
  const [context, setContext] = useState<Context | null>(null);
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [asked, setAsked] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | 'undo' | null>(null);

  const load = async () => {
    const response = await fetch('/api/leads/assistant', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) { setContext(null); return; }
    setContext(await response.json().catch(() => null));
  };
  useEffect(() => { void load(); }, []);

  if (!context) return null;

  async function ask() {
    const text = command.trim();
    if (text.length < 3 || busy) return;
    setBusy('preview');
    setPreview(null);
    try {
      const response = await fetch('/api/leads/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível entender o comando.');
      setAsked(text);
      setPreview(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entender o comando.');
    } finally {
      setBusy(null);
    }
  }

  async function apply(plan: Distribution) {
    if (busy) return;
    setBusy('apply');
    try {
      const response = await fetch('/api/leads/assistant/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.plan, expectedMoves: plan.moves, command: asked }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível aplicar.');
      toast.success(`${data.moves} lead(s) mudaram de responsável. Se precisar, use "Desfazer".`);
      setPreview(null);
      setCommand('');
      await load();
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar.');
    } finally {
      setBusy(null);
    }
  }

  async function undo(batchId: string) {
    if (busy || !window.confirm('Desfazer essa distribuição? Cada lead volta para quem estava antes (os que foram mudados de novo depois ficam como estão).')) return;
    setBusy('undo');
    try {
      const response = await fetch('/api/leads/assistant/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível desfazer.');
      toast.success(`${data.restored} lead(s) voltaram para quem estavam${data.skipped ? `; ${data.skipped} já tinham sido mudados de novo e ficaram como estão` : ''}.`);
      await load();
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desfazer.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="w-4 h-4 mr-1" />Assistente de leads
      </Button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assistente de leads</DialogTitle>
            <DialogDescription>
              Escreva o que quer fazer. Você vê uma prévia antes, e nada muda até você confirmar. Só muda o responsável dos leads em aberto no Kanban; as conversas continuam com quem estão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <Textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }}
              placeholder="Ex.: distribua todos os leads de igual modo para os novos atendentes"
              maxLength={400}
              rows={2}
            />
            <div className="flex flex-wrap gap-1.5">
              {LEAD_ASSISTANT_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setCommand(example)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {example}
                </button>
              ))}
            </div>
            <Button type="button" onClick={() => void ask()} disabled={!!busy || command.trim().length < 3}>
              {busy === 'preview' ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Entendendo...</> : 'Ver prévia'}
            </Button>

            {preview?.kind === 'unsupported' ? <p className="rounded-md bg-muted p-3">{preview.message}</p> : null}

            {preview?.kind === 'report' ? (
              <div className="rounded-md border p-3">
                <p className="font-medium mb-2">{preview.title}</p>
                <table className="w-full">
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.name} className="border-t first:border-t-0">
                        <td className="py-1">{row.name}</td>
                        <td className="py-1 text-right tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {preview?.kind === 'distribution' ? (
              <div className="rounded-md border p-3 space-y-3">
                <p>
                  <strong>Prévia:</strong> {preview.chosen} {preview.scopeText}, divididos {preview.modeText} entre {preview.targetsText}.
                </p>
                {preview.moves === 0 ? (
                  <p className="text-muted-foreground">Nenhum lead precisa mudar: já está tudo distribuído assim.</p>
                ) : (
                  <>
                    <p><strong>{preview.moves} lead(s) vão mudar de responsável.</strong></p>
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1 font-normal">Atendente</th>
                          <th className="py-1 font-normal text-right">Tem hoje</th>
                          <th className="py-1 font-normal text-right">Recebe</th>
                          <th className="py-1 font-normal text-right">Fica com</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.targets.map((target) => (
                          <tr key={target.id} className="border-t">
                            <td className="py-1">{target.name}</td>
                            <td className="py-1 text-right tabular-nums">{target.before}</td>
                            <td className="py-1 text-right tabular-nums">
                              +{target.receives}{target.losesInside ? ` / -${target.losesInside}` : ''}
                            </td>
                            <td className="py-1 text-right tabular-nums font-medium">{target.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.from.length ? (
                      <p className="text-muted-foreground">
                        Saem de: {preview.from.map((item) => `${item.name} (${item.count})`).join(', ')}.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {context.recent.length ? (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Últimas mudanças do assistente</p>
                <ul className="space-y-1">
                  {context.recent.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate" title={item.command}>
                        {when(item.at)}{item.by ? ` · ${item.by}` : ''} · {item.moves} lead(s) · “{item.command}”
                      </span>
                      {item.undone ? <span className="text-muted-foreground shrink-0">Desfeita</span> : (
                        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0" disabled={!!busy} onClick={() => void undo(item.id)}>
                          <Undo2 className="w-3.5 h-3.5 mr-1" />Desfazer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy === 'apply'}>Fechar</Button>
            {preview?.kind === 'distribution' && preview.moves > 0 ? (
              <Button type="button" onClick={() => void apply(preview)} disabled={!!busy}>
                {busy === 'apply' ? 'Aplicando...' : `Confirmar: mudar ${preview.moves} lead(s)`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
