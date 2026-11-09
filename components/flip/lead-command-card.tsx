'use client';

import { useState } from 'react';
import { Check, Loader2, Undo2, Users } from 'lucide-react';

export type LeadCommandPreview =
  | {
    kind: 'distribution';
    plan: unknown;
    scopeText: string;
    modeText: string;
    targetsText: string;
    chosen: number;
    moves: number;
    targets: Array<{ id: string; name: string; before: number; receives: number; losesInside: number; after: number }>;
    from: Array<{ name: string; count: number }>;
  }
  | { kind: 'report'; title: string; rows: Array<{ name: string; count: number }> }
  | { kind: 'undo'; batch: { id: string; at: string; by: string | null; command: string; moves: number } }
  | { kind: 'message'; message: string };

type State = { step: 'preview' } | { step: 'done'; text: string; batchId: string | null } | { step: 'cancelled' } | { step: 'undone'; text: string };

const when = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

/**
 * The answer of the Flip bar to a command about leads. A distribution shows what will change and
 * waits for "Confirmar"; once applied, it can be undone right there.
 */
export function LeadCommandCard({ command, preview }: { command: string; preview: LeadCommandPreview }) {
  const [state, setState] = useState<State>({ step: 'preview' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Runs an action; on failure the card stays where it was (a done change never shows "Confirmar" again). */
  async function run(action: () => Promise<State>) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      setState(await action());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  const undo = (batchId: string) => run(async () => {
    const data = await post('/api/leads/assistant/undo', { batchId });
    return {
      step: 'undone',
      text: `Desfeito: ${data.restored} lead(s) voltaram para quem estavam${data.skipped ? `; ${data.skipped} já tinham sido mudados de novo e ficaram como estão` : ''}.`,
    };
  });

  const buttons = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-50';

  return (
    <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-800">
      {preview.kind === 'message' ? <p>{preview.message}</p> : null}

      {preview.kind === 'report' ? (
        <div>
          <p className="font-medium">{preview.title}</p>
          <table className="mt-2 w-full text-sm">
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

      {preview.kind === 'undo' && state.step !== 'undone' ? (
        <>
          <p>
            Desfazer a distribuição de {when(preview.batch.at)}{preview.batch.by ? `, feita por ${preview.batch.by}` : ''} ({preview.batch.moves} lead(s)): “{preview.batch.command}”?
            Cada lead volta para quem estava; os que foram mudados de novo depois ficam como estão.
          </p>
          {state.step !== 'cancelled' ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void undo(preview.batch.id)} className={`${buttons} bg-indigo-600 text-white hover:bg-indigo-700`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}Confirmar e desfazer
              </button>
              <button type="button" disabled={busy} onClick={() => setState({ step: 'cancelled' })} className={`${buttons} bg-slate-100 hover:bg-slate-200`}>Cancelar</button>
            </div>
          ) : <p className="text-sm text-muted-foreground">Cancelado. Nada foi alterado.</p>}
        </>
      ) : null}

      {preview.kind === 'distribution' && (state.step === 'preview' || state.step === 'cancelled') ? (
        <>
          <p>{preview.chosen} {preview.scopeText}, divididos {preview.modeText} entre {preview.targetsText}.</p>
          {preview.moves === 0 ? <p className="text-sm text-muted-foreground">Nenhum lead precisa mudar: já está tudo distribuído assim.</p> : (
            <>
              <p className="font-medium flex items-center gap-1.5"><Users className="h-4 w-4 text-indigo-600" aria-hidden="true" />{preview.moves} lead(s) vão mudar de responsável:</p>
              <table className="w-full text-sm">
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
                      <td className="py-1 text-right tabular-nums">+{target.receives}{target.losesInside ? ` / -${target.losesInside}` : ''}</td>
                      <td className="py-1 text-right tabular-nums font-medium">{target.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.from.length ? <p className="text-sm text-muted-foreground">Saem de: {preview.from.map((item) => `${item.name} (${item.count})`).join(', ')}.</p> : null}
              <p className="text-xs text-muted-foreground">Muda só o responsável no Kanban; as conversas continuam com quem estão.</p>
              {state.step === 'cancelled' ? <p className="text-sm text-muted-foreground">Cancelado. Nada foi alterado.</p> : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy}
                    onClick={() => void run(async () => {
                      const data = await post('/api/leads/assistant/apply', { plan: preview.plan, expectedMoves: preview.moves, command });
                      return { step: 'done', text: `Pronto: ${data.moves} lead(s) mudaram de responsável.`, batchId: data.batchId };
                    })}
                    className={`${buttons} bg-indigo-600 text-white hover:bg-indigo-700`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Confirmar
                  </button>
                  <button type="button" disabled={busy} onClick={() => setState({ step: 'cancelled' })} className={`${buttons} bg-slate-100 hover:bg-slate-200`}>Cancelar</button>
                </div>
              )}
            </>
          )}
        </>
      ) : null}

      {state.step === 'done' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-medium text-emerald-700">{state.text}</p>
          {state.batchId ? (
            <button type="button" disabled={busy} onClick={() => void undo(state.batchId as string)} className={`${buttons} bg-slate-100 hover:bg-slate-200`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}Desfazer
            </button>
          ) : null}
        </div>
      ) : null}
      {state.step === 'undone' ? <p className="font-medium text-emerald-700">{state.text}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
