'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function CheckoutPage({ params }: { params: { planSlug: string } }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpfCnpj: '', companyName: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await fetch('/api/public/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, planSlug: params.planSlug }) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data?.error || 'Falha ao iniciar checkout');
    window.location.href = data.checkoutUrl || '/checkout/pending';
  }

  if (params.planSlug === 'enterprise') return <div className="p-8">Plano Enterprise é sob consulta.</div>;

  return <div className="p-8 max-w-xl mx-auto"><h1 className="text-2xl font-bold mb-4">Checkout — {params.planSlug}</h1><form onSubmit={submit} className="space-y-3">
    <input className="w-full border p-2" placeholder="Nome" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required />
    <input className="w-full border p-2" placeholder="E-mail" type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} required />
    <input className="w-full border p-2" placeholder="Telefone (opcional)" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
    <input className="w-full border p-2" placeholder="CPF/CNPJ (opcional)" value={form.cpfCnpj} onChange={(e)=>setForm({...form,cpfCnpj:e.target.value})} />
    <input className="w-full border p-2" placeholder="Empresa" value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})} />
    {error && <p className="text-red-600 text-sm">{error}</p>}
<p className="text-xs text-muted-foreground">Ao continuar, você concorda com os <Link href="/legal/terms" className="underline">Termos de Uso</Link> e a <Link href="/legal/privacy" className="underline">Política de Privacidade</Link>.</p>
    <button className="px-4 py-2 bg-black text-white" disabled={loading}>{loading ? 'Iniciando...' : 'Iniciar pagamento'}</button>
  </form></div>;
}
