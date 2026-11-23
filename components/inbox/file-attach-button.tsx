'use client';

import { useRef, useState } from 'react';
import { Paperclip, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkOutboundFile, OUTBOUND_FILE_ACCEPT } from '@/lib/inbox/outbound-file-rules';

/**
 * Picks a file (document, photo or video), checks it, shows what will be sent and sends it on
 * confirmation. `onSend` returns whether it went out.
 */
export function FileAttachButton({ disabled, onSend, onError }: {
  disabled?: boolean;
  onSend: (file: File) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  function choose(chosen: File | undefined) {
    if (input.current) input.current.value = '';
    if (!chosen) return;
    const check = checkOutboundFile({ name: chosen.name, mimeType: chosen.type, sizeBytes: chosen.size });
    if (!check.ok) {
      onError(check.error);
      return;
    }
    setFile(chosen);
  }

  async function send() {
    if (!file) return;
    setSending(true);
    const sent = await onSend(file);
    setSending(false);
    if (sent) setFile(null);
  }

  const size = file ? (file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : '';

  return (
    <>
      <input ref={input} type="file" accept={OUTBOUND_FILE_ACCEPT} className="hidden" onChange={(event) => choose(event.target.files?.[0])} />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-11 w-11 shrink-0"
        disabled={disabled || sending}
        onClick={() => input.current?.click()}
        aria-label="Anexar arquivo (documento, foto ou vídeo)"
        title="Anexar arquivo (documento, foto ou vídeo)"
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      {file ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Enviar arquivo">
          <div className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-4 shadow-lg">
            <div>
              <p className="font-semibold">Enviar arquivo ao cliente?</p>
              <p className="mt-1 break-all text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{size} · vai pelo WhatsApp da empresa e fica guardado na conversa</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={sending} onClick={() => setFile(null)}>Cancelar</Button>
              <Button type="button" disabled={sending} onClick={() => void send()}>
                {sending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
