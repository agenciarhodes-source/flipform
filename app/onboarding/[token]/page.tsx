'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function OnboardingPage({ params }: { params: { token: string } }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await fetch('/api/public/onboarding/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: params.token, name, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data?.error || 'Falha no onboarding');
    window.location.href = data.nextUrl || '/checkout/pending';
  }

  return <div className="p-8 max-w-xl mx-auto space-y-4"><h1 className="text-2xl font-bold">Bem-vindo ao FlipForm</h1><p className="text-sm text-muted-foreground">Defina seu usuário owner para concluir o onboarding.</p>
    <form onSubmit={submit} className="space-y-3">
      <input className="w-full border p-2" placeholder="Seu nome" value={name} onChange={(e)=>setName(e.target.value)} required />
      <input className="w-full border p-2" placeholder="Senha (mínimo 8 caracteres)" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={8} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="px-4 py-2 bg-black text-white">{loading ? 'Processando...' : 'Concluir onboarding'}</button>
    </form>
    <div className="text-xs text-muted-foreground">
      <Link href="/legal/terms" className="underline">Termos de Uso</Link> · <Link href="/legal/privacy" className="underline">Política de Privacidade</Link> · <Link href="/legal/support" className="underline">Suporte</Link>
    </div>
  </div>;
}
