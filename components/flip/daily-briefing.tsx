'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Briefing = { id: string; day: string; text: string; seenAt: string | null };
const MUTE_KEY = 'flipform:flip-briefing:popup-off';

function popupMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

type BriefingState = { briefing: Briefing | null; companyEnabled: boolean; canManageCompany: boolean };

async function loadState(): Promise<BriefingState> {
  const response = await fetch('/api/flip/briefing', { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) return { briefing: null, companyEnabled: true, canManageCompany: false };
  const data = await response.json().catch(() => ({}));
  return { briefing: data.briefing || null, companyEnabled: data.companyEnabled !== false, canManageCompany: data.canManageCompany === true };
}

async function loadBriefing(): Promise<Briefing | null> {
  return (await loadState()).briefing;
}

function markSeen(id: string) {
  void fetch('/api/flip/briefing', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  }).catch(() => undefined);
}

/** The first time the person opens FlipForm in the day, the summary shows up once. */
export function DailyBriefingPopup() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  useEffect(() => {
    if (popupMuted()) return;
    void loadBriefing().then((loaded) => { if (loaded && !loaded.seenAt) setBriefing(loaded); });
  }, []);
  if (!briefing) return null;
  const close = () => { markSeen(briefing.id); setBriefing(null); };
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-32px)] rounded-xl border bg-white p-4 shadow-xl" role="dialog" aria-label="Resumo do dia">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" /> Resumo do dia · Flip</p>
        <button type="button" onClick={close} aria-label="Fechar resumo"><X className="h-4 w-4" /></button>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed">{briefing.text}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={close}>Fechar</Button>
        <Button type="button" size="sm" asChild onClick={() => markSeen(briefing.id)}><Link href="/flip">Ver no Flip</Link></Button>
      </div>
    </div>
  );
}

/** The summary at the top of the Flip page, with the switch for the daily popup. */
export function DailyBriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null | undefined>(undefined);
  const [muted, setMuted] = useState(false);
  const [company, setCompany] = useState({ enabled: true, canManage: false });
  const [savingCompany, setSavingCompany] = useState(false);
  useEffect(() => {
    setMuted(popupMuted());
    void loadState().then((state) => {
      setBriefing(state.briefing);
      setCompany({ enabled: state.companyEnabled, canManage: state.canManageCompany });
    });
  }, []);
  async function toggleCompany() {
    setSavingCompany(true);
    try {
      const response = await fetch('/api/flip/briefing', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyEnabled: !company.enabled }),
      });
      if (!response.ok) return;
      const next = !company.enabled;
      setCompany((current) => ({ ...current, enabled: next }));
      if (next) void loadBriefing().then(setBriefing);
      else setBriefing(null);
    } finally {
      setSavingCompany(false);
    }
  }
  const toggle = () => {
    const next = !muted;
    try { window.localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* the choice just is not remembered */ }
    setMuted(next);
  };
  if (briefing === undefined) return null;
  return (
    <article className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-violet-900"><Sparkles className="h-4 w-4" aria-hidden="true" /> Resumo de hoje</p>
        <span className="flex flex-wrap items-center gap-3">
          {company.enabled && (
            <button type="button" className="text-xs text-violet-800 underline" onClick={toggle}>
              {muted ? 'Mostrar o resumo ao abrir o FlipForm' : 'Não mostrar ao abrir o FlipForm'}
            </button>
          )}
          {company.canManage && (
            <button type="button" className="text-xs font-medium text-violet-900 underline" disabled={savingCompany} onClick={() => void toggleCompany()}>
              {company.enabled ? 'Desligar o resumo para a empresa toda' : 'Ligar o resumo para a empresa toda'}
            </button>
          )}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-violet-950">
        {!company.enabled
          ? 'O resumo diário está desligado para a empresa.'
          : briefing ? briefing.text : 'O resumo do dia aparece a partir das 7h.'}
      </p>
    </article>
  );
}
