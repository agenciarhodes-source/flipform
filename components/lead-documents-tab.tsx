'use client';

import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';

type CaseView = {
  name: string;
  items: Array<{ label: string; rule: string; status: string; files: Array<{ messageId: string; href: string; status: string; note: string | null; createdAt: string }> }>;
  others: Array<{ messageId: string; detectedType: string | null; status: string; createdAt: string }>;
};

const ICON: Record<string, string> = { received: '✅', unreadable: '⚠️', problem: '⚠️', missing: '⏳', unrecognized: '❔' };
const LABEL: Record<string, string> = { received: 'Recebido', unreadable: 'Ilegível', problem: 'Com problema', missing: 'Falta', unrecognized: 'Não reconhecido' };

/** The documents the Flip AI checked for this lead, by type of case, with a link to each file. */
export function LeadDocumentsTab({ leadId }: { leadId: string }) {
  const [cases, setCases] = useState<CaseView[] | null>(null);
  useEffect(() => {
    fetch(`/api/leads/${encodeURIComponent(leadId)}/documents`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { cases: [] }))
      .then((data) => setCases(Array.isArray(data.cases) ? data.cases : []))
      .catch(() => setCases([]));
  }, [leadId]);

  if (cases === null) return <p className="text-sm text-muted-foreground">Carregando documentos...</p>;
  if (!cases.length) {
    return <p className="text-sm text-muted-foreground">Nenhum documento conferido pela IA ainda. Os documentos enviados pelo WhatsApp aparecem aqui quando a IA os confere.</p>;
  }
  return (
    <div className="space-y-4">
      {cases.map((entry) => {
        const done = entry.items.filter((item) => item.status === 'received').length;
        return (
          <div key={entry.name} className="rounded-lg border p-3">
            <p className="font-medium">{entry.name} <span className="text-sm text-muted-foreground">· {done} de {entry.items.length} recebidos</span></p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {entry.items.map((item) => (
                <li key={item.label} className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">{ICON[item.status] || '⏳'}</span>
                  <span className="font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{LABEL[item.status] || item.status}{item.rule ? ` · ${item.rule}` : ''}</span>
                  {item.files.map((file, index) => (
                    <a key={file.messageId} href={file.href} target="_blank" rel="noreferrer"
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 px-2' })} title={file.note || undefined}>
                      arquivo {index + 1}{file.status !== 'received' ? ` (${LABEL[file.status] || file.status})` : ''}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
            {entry.others.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Outros arquivos: {entry.others.map((other) => other.detectedType || 'arquivo').join(', ')}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">O FlipForm guarda uma cópia dos arquivos por 7 dias (aparecem também em Flip AI › Arquivos). Depois disso, o arquivo ainda abre pela Meta por até 30 dias. Baixe o que precisar manter.</p>
    </div>
  );
}
