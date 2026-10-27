'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Second step of the sign-in (security protocol S5): the 6-digit code from the authenticator app,
 * or a recovery code. Calls onSuccess with the same answer the sign-in would have given.
 */
export function MfaLoginStep({
  mfaToken,
  onSuccess,
  onCancel,
  dark = false,
}: {
  mfaToken: string;
  onSuccess: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  dark?: boolean;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'mfa_expired') { onCancel(); }
        throw new Error(data.error || 'Código inválido.');
      }
      onSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className={`text-sm ${dark ? 'text-slate-300' : 'text-muted-foreground'}`}>
        Abra o Google Authenticator (ou o aplicativo que você usa) e digite o código de 6 dígitos do FlipForm.
        Sem o celular? Use um dos códigos de recuperação.
      </p>
      <div className="space-y-2">
        <Label htmlFor="mfa-code" className={dark ? 'text-slate-200' : undefined}>Código</Label>
        <Input id="mfa-code" autoFocus inputMode="text" autoComplete="one-time-code" maxLength={20} value={code}
          onChange={(e) => setCode(e.target.value)} className={dark ? 'bg-slate-900 border-slate-700 text-slate-100' : undefined} required />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || code.trim().length < 6}>
        {loading ? 'Verificando...' : 'Confirmar'}
      </Button>
      <button type="button" onClick={onCancel} className={`w-full text-xs underline ${dark ? 'text-slate-400' : 'text-muted-foreground'}`}>
        Voltar e entrar com outra conta
      </button>
    </form>
  );
}
