'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

function when(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
}

/** "Corrigir": the customer gets "✏️ Correção: ..." quoting the wrong message; FlipForm keeps both versions. */
export function MessageCorrectionDialog(props: { messageId: string; currentText: string; onDone: () => void; onClose: () => void }) {
  const [text, setText] = useState(props.currentText);
  const [saving, setSaving] = useState(false);

  async function send() {
    setSaving(true);
    try {
      const response = await fetch(`/api/inbox/messages/${encodeURIComponent(props.messageId)}/corrections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a correção.');
      toast.success('Correção enviada ao cliente.');
      props.onDone();
      props.onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a correção.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Corrigir mensagem</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O WhatsApp não deixa editar uma mensagem já enviada. O cliente recebe uma nova mensagem respondendo à antiga:
            “✏️ Correção: …”. Aqui no FlipForm, a mensagem aparece corrigida e marcada como editada, com o histórico.
          </p>
          <Textarea rows={5} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={props.onClose}>Cancelar</Button>
            <Button disabled={saving || !text.trim() || text.trim() === props.currentText.trim()} onClick={send}>
              {saving ? 'Enviando…' : 'Enviar correção'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Edit = { id: string; before: string; after: string; at: string; editor: string | null };

/** History of versions of a corrected message (only the team sees it). */
export function MessageEditHistoryDialog(props: { messageId: string; onClose: () => void }) {
  const [edits, setEdits] = useState<Edit[] | null>(null);
  useEffect(() => {
    fetch(`/api/inbox/messages/${encodeURIComponent(props.messageId)}/corrections`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((data) => setEdits(Array.isArray(data?.edits) ? data.edits : []))
      .catch(() => setEdits([]));
  }, [props.messageId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Histórico de edições</DialogTitle></DialogHeader>
        {edits === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : edits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma edição.</p>
        ) : (
          <ol className="space-y-3">
            {edits.map((edit) => (
              <li key={edit.id} className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{when(edit.at)}{edit.editor ? ` · ${edit.editor}` : ''}</p>
                <p><span className="text-xs font-medium text-red-700">Antes: </span><span className="whitespace-pre-wrap line-through decoration-red-300">{edit.before}</span></p>
                <p><span className="text-xs font-medium text-emerald-700">Depois: </span><span className="whitespace-pre-wrap">{edit.after}</span></p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
