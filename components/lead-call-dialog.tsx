'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CALL_OUTCOMES, dialHref, whatsappHref, type CallOutcome } from '@/lib/leads/call-rules';

type CallTask = { id: string; title: string; dueDate: string | null };
type Call = { id: string; label: string; note: string | null; createdAt: string; userName: string | null };

function when(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
}

/** Tomorrow at 10:00, as the value of a datetime-local field. */
function tomorrowAtTen() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Ligar": call from the phone or WhatsApp, then record how it went. */
export function LeadCallDialog(props: { leadId: string; leadName: string; phone: string | null; onSaved: () => void; onClose: () => void }) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState('');
  const [callbackAt, setCallbackAt] = useState(tomorrowAtTen());
  const [tasks, setTasks] = useState<CallTask[]>([]);
  const [finish, setFinish] = useState<string[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [saving, setSaving] = useState(false);
  const dial = dialHref(props.phone);
  const whatsapp = whatsappHref(props.phone);

  useEffect(() => {
    fetch(`/api/leads/${props.leadId}/calls`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.ready) return;
      setTasks(data.callTasks || []);
      setFinish((data.callTasks || []).map((task: CallTask) => task.id));
      setCalls(data.calls || []);
    }).catch(() => undefined);
  }, [props.leadId]);

  async function save() {
    if (!outcome) { toast.error('Escolha como foi a ligação.'); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${props.leadId}/calls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome, note,
          callbackAt: outcome === 'callback' && callbackAt ? new Date(callbackAt).toISOString() : null,
          completeTaskIds: outcome === 'no_answer' || outcome === 'voicemail' ? [] : finish,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar.');
      toast.success(data.callbackTask ? 'Ligação registrada e retorno agendado nas tarefas.' : 'Ligação registrada.');
      props.onSaved();
      props.onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar.');
    } finally {
      setSaving(false);
    }
  }

  const reached = outcome === 'answered' || outcome === 'callback' || outcome === 'wrong_number';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ligar para {props.leadName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {dial ? (
            <div className="flex flex-wrap gap-2">
              <a href={dial} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                <Phone className="h-4 w-4" aria-hidden="true" /> Ligar pelo celular
              </a>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir no WhatsApp
                </a>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Este lead não tem um telefone válido.</p>
          )}
          <p className="text-xs text-muted-foreground">Depois da ligação, registre como foi. Fica no resumo do cliente.</p>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Como foi?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CALL_OUTCOMES) as CallOutcome[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOutcome(key)}
                  className={`rounded-lg border px-2 py-1.5 text-left text-sm ${outcome === key ? 'border-brand-600 bg-brand-50 font-medium' : 'hover:bg-muted'}`}
                >
                  {CALL_OUTCOMES[key]}
                </button>
              ))}
            </div>
          </div>

          {outcome === 'callback' && (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Ligar de novo em</span>
              <input type="datetime-local" className="w-full rounded-lg border px-3 py-2" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} />
              <span className="block text-xs text-muted-foreground">Vira uma tarefa para você, com lembrete 15 minutos antes.</span>
            </label>
          )}

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Anotação</span>
            <Textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="O que foi conversado, o que ficou combinado…" />
          </label>

          {reached && tasks.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Concluir tarefas de ligação</p>
              {tasks.map((task) => (
                <label key={task.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={finish.includes(task.id)}
                    onChange={() => setFinish(finish.includes(task.id) ? finish.filter((id) => id !== task.id) : [...finish, task.id])}
                  />
                  <span>{task.title}</span>
                </label>
              ))}
            </div>
          )}

          <Button className="w-full" disabled={saving || !outcome} onClick={save}>{saving ? 'Salvando…' : 'Registrar ligação'}</Button>

          {calls.length > 0 && (
            <div className="space-y-1 border-t pt-3 text-xs">
              <p className="font-medium">Ligações anteriores</p>
              {calls.slice(0, 5).map((call) => (
                <p key={call.id} className="text-muted-foreground">
                  {when(call.createdAt)} · {call.label}{call.userName ? ` · ${call.userName}` : ''}{call.note ? ` — ${call.note}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
