'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; recommended: boolean };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

/**
 * Two-step verification of the person signed in (security protocol S5): Google Authenticator or
 * any TOTP app. Turn on with the QR code and a first code; recovery codes are shown once.
 */
export function MfaCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/auth/mfa', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null)).then((data) => data && setStatus(data)).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  if (!status) return null;

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await post('/api/auth/mfa/setup'));
      setCode('');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const enable = async () => {
    setBusy(true);
    try {
      const data = await post('/api/auth/mfa/enable', { code });
      setRecoveryCodes(data.recoveryCodes || []);
      setSetup(null);
      setCode('');
      toast.success('Verificação em duas etapas ligada.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await post('/api/auth/mfa/disable', { code });
      setDisabling(false);
      setCode('');
      toast.success('Verificação em duas etapas desligada.');
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Card className={`p-5 space-y-4 ${className || ''}`}>
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-brand-600" />
        <h3 className="font-heading font-semibold">Verificação em duas etapas</h3>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${status.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
          {status.enabled ? 'Ligada' : 'Desligada'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Além da senha, o login pede um código de 6 dígitos do aplicativo <strong>Google Authenticator</strong> (ou outro aplicativo autenticador) no seu celular.
        {!status.enabled && status.recommended ? ' Recomendado para donos da conta e administradores.' : ''}
      </p>

      {recoveryCodes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Guarde estes códigos de recuperação em um lugar seguro. Eles aparecem só agora.</p>
          <p>Se perder o celular, cada código permite entrar uma vez no lugar do código do aplicativo.</p>
          <div className="grid grid-cols-2 gap-1 font-mono">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>
          <Button size="sm" variant="outline" onClick={() => setRecoveryCodes(null)}>Já guardei</Button>
        </div>
      )}

      {!status.enabled && !setup && (
        <Button onClick={start} disabled={busy}>{busy ? 'Gerando...' : 'Ativar verificação em duas etapas'}</Button>
      )}

      {setup && (
        <div className="space-y-3">
          <ol className="list-decimal pl-5 text-sm space-y-1">
            <li>Abra o Google Authenticator no celular e toque em <strong>+</strong>.</li>
            <li>Escaneie o QR code abaixo (ou digite a chave).</li>
            <li>Digite o código de 6 dígitos que aparecer no aplicativo.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR code para o aplicativo autenticador" className="h-44 w-44 rounded border bg-white p-1" />
          <p className="text-xs text-muted-foreground break-all">Chave: <span className="font-mono">{setup.secret}</span></p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="mfa-enable-code">Código do aplicativo</Label>
              <Input id="mfa-enable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-36" />
            </div>
            <Button onClick={enable} disabled={busy || code.length !== 6}>{busy ? 'Confirmando...' : 'Confirmar e ligar'}</Button>
            <Button variant="ghost" onClick={() => setSetup(null)} disabled={busy}>Cancelar</Button>
          </div>
        </div>
      )}

      {status.enabled && !disabling && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Códigos de recuperação restantes: {status.recoveryCodesLeft}.</p>
          <Button variant="outline" onClick={() => { setDisabling(true); setCode(''); }}>Desligar</Button>
        </div>
      )}
      {status.enabled && disabling && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="mfa-disable-code">Código do aplicativo ou de recuperação</Label>
            <Input id="mfa-disable-code" value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} className="w-56" />
          </div>
          <Button variant="destructive" onClick={disable} disabled={busy || code.trim().length < 6}>{busy ? 'Desligando...' : 'Confirmar e desligar'}</Button>
          <Button variant="ghost" onClick={() => setDisabling(false)} disabled={busy}>Cancelar</Button>
        </div>
      )}
    </Card>
  );
}
