'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export default function FirstAccessPage() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setError('Link inválido ou expirado.'); setLoading(false); return; }
      const res = await fetch(`/api/auth/first-access/validate?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await readJsonSafe(res);
      if (!res.ok) setError((data as any)?.error || 'Link inválido ou expirado.');
      else { setEmail((data as any).email || ''); setTenantName((data as any).tenantName || ''); }
      setLoading(false);
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    const res = await fetch('/api/auth/first-access/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password, confirmPassword }) });
    const data = await readJsonSafe(res);
    if (!res.ok) return setError((data as any)?.error || 'Falha ao definir senha.');
    setSuccess('Senha definida com sucesso. Redirecionando para login...');
    setTimeout(() => { window.location.href = '/login'; }, 1200);
  }

  if (loading) return <div className="p-8 max-w-xl mx-auto">Validando link...</div>;
  return <div className="p-8 max-w-xl mx-auto space-y-4"><h1 className="text-2xl font-bold">Primeiro acesso</h1>{tenantName && <p className="text-sm text-muted-foreground">Empresa: {tenantName}</p>}{email && <p className="text-sm text-muted-foreground">E-mail: {email}</p>}{error && <p className="text-sm text-red-600">{error}</p>}{success && <p className="text-sm text-emerald-700">{success}</p>}{!success && !error && <form onSubmit={submit} className="space-y-3"><input className="w-full border p-2" type="password" placeholder="Nova senha" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} required /><input className="w-full border p-2" type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={8} required /><button className="px-4 py-2 bg-black text-white" type="submit">Definir senha</button></form>}</div>;
}
