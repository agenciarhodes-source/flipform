'use client';

import { useState } from 'react';
import Link from 'next/link';

type PaymentMethod = 'pix' | 'card' | 'boleto';

/** A plan as sold: price and limits come from the plans table, the same values that are charged. */
export type CheckoutPlan = { slug: string; name: string; price: number; features: string[]; recommended?: boolean; includesAi?: boolean };

function toBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function digitsOnly(v: string) { return v.replace(/\D/g, ''); }
function maskCpfCnpj(v: string) {
  const d = digitsOnly(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}
function maskPhone(v: string) {
  const d = digitsOnly(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}
function maskCep(v: string) { return digitsOnly(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2'); }

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export function CheckoutClient({ initialSlug, plans, trialDays }: { initialSlug: string; plans: CheckoutPlan[]; trialDays: number }) {
  const known = plans.some((item) => item.slug === initialSlug);
  const [planSlug, setPlanSlug] = useState(known ? initialSlug : (plans.find((item) => item.recommended) || plans[0])?.slug || '');
  const plan = plans.find((item) => item.slug === planSlug) || plans[0];
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [form, setForm] = useState({ name: '', email: '', emailConfirm: '', cpfCnpj: '', phone: '', companyName: '', cep: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const total = plan ? plan.price : 0;

  if (!known || !plan) {
    return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-2xl font-bold text-slate-900">Plano inválido</h1><p className="mt-2 text-slate-600">Não encontramos este plano de checkout.</p><a href="https://flipform.com.br#planos" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Ver planos disponíveis</a></div></div>;
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Nome completo é obrigatório.';
    if (!form.email.trim()) e.email = 'E-mail é obrigatório.';
    if (!form.emailConfirm.trim()) e.emailConfirm = 'Confirme o e-mail.';
    if (form.email.trim() && form.emailConfirm.trim() && form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) e.emailConfirm = 'Os e-mails não conferem.';
    if (!form.companyName.trim()) e.companyName = 'Empresa / negócio é obrigatório.';
    return e;
  }

  async function handleSubmit() {
    if (loading) return;
    const e = validate();
    setFieldErrors(e);
    setError(null);
    if (Object.keys(e).length) return;

    setLoading(true);
    const res = await fetch('/api/public/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planSlug, name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), cpfCnpj: form.cpfCnpj.trim(), companyName: form.companyName.trim(), metadata: { paymentMethod: payment, cep: form.cep.trim() } }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) { setLoading(false); setError((data as any)?.error || 'Não foi possível iniciar o checkout. Revise os dados ou tente novamente.'); return; }
    window.location.href = (data as any)?.checkoutUrl || '/checkout/pending';
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-600">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="https://flipform.com.br" className="flex items-center gap-2 no-underline"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">≡</span><span className="font-bold text-slate-900">FlipForm</span></a>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Checkout seguro</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-6 flex items-center gap-2 text-xs font-semibold"><span className="rounded-full bg-emerald-500 px-2 py-1 text-white">✓</span>Plano <span className="h-px flex-1 bg-slate-300" /> <span className="rounded-full bg-blue-600 px-2 py-1 text-white">2</span>Dados <span className="h-px flex-1 bg-slate-300" /> <span className="rounded-full border border-slate-300 px-2 py-1">3</span>Pagamento</div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Escolha seu plano</h2>
            <div className="space-y-3">
              {plans.map((item) => (
                <button key={item.slug} type="button" onClick={() => setPlanSlug(item.slug)} className={`relative flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left ${item.slug === planSlug ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                  {item.recommended && <span className="absolute -top-2 right-3 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">Mais escolhido</span>}
                  <span className={`mt-1 h-4 w-4 rounded-full border-2 ${item.slug === planSlug ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
                  <div className="flex-1"><div className="flex items-center justify-between"><strong className="text-slate-900">{item.name}</strong><strong className="text-slate-900">{toBrl(item.price)}<span className="text-xs font-normal text-slate-500">/mês</span></strong></div><p className="text-xs text-slate-500">{item.features.join(' · ')}</p>{item.includesAi && <p className="mt-1 text-xs font-semibold text-violet-700">Inclui o atendente de IA (Flip AI) no site e no WhatsApp</p>}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Dados pessoais</h2>
            <div className="grid gap-3">
              <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Seu nome completo" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />{fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><div><input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="seu@email.com" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} />{fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}</div><div><input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="confirme seu@email.com" value={form.emailConfirm} onChange={(e)=>setForm({...form,emailConfirm:e.target.value})} />{fieldErrors.emailConfirm && <p className="text-xs text-red-600">{fieldErrors.emailConfirm}</p>}</div></div>
              <div className="grid gap-3 sm:grid-cols-2"><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="000.000.000-00" value={form.cpfCnpj} onChange={(e)=>setForm({...form,cpfCnpj:maskCpfCnpj(e.target.value)})} /><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="(00) 00000-0000" value={form.phone} onChange={(e)=>setForm({...form,phone:maskPhone(e.target.value)})} /></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Nome da empresa" value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})} />{fieldErrors.companyName && <p className="text-xs text-red-600">{fieldErrors.companyName}</p>}</div><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="00000-000" value={form.cep} onChange={(e)=>setForm({...form,cep:maskCep(e.target.value)})} /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Forma de pagamento</h2>
            <div className="space-y-2">
              {(['pix', 'card', 'boleto'] as PaymentMethod[]).map((m) => <button type="button" key={m} onClick={()=>setPayment(m)} className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left ${payment===m?'border-blue-600 bg-blue-50':'border-slate-200'}`}><span className={`h-4 w-4 rounded-full border-2 ${payment===m?'border-blue-600 bg-blue-600':'border-slate-300'}`} /><span className="font-medium text-slate-900">{m==='pix'?'Pix':m==='card'?'Cartão de crédito':'Boleto bancário'}</span></button>)}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">{trialDays > 0 ? (<>
              {payment==='card' && `Você cadastra o cartão na página segura do Stripe e já começa a usar. A primeira cobrança acontece só depois dos ${trialDays} dias grátis e depois todo mês, automaticamente. Os dados do cartão não passam pelo FlipForm.`}
              {payment!=='card' && `Você já começa a usar agora. No fim dos ${trialDays} dias grátis, a fatura chega no seu e-mail para pagar por ${payment==='pix'?'Pix (QR Code)':'boleto'} e depois todo mês. Na fatura também dá para escolher outra forma de pagamento.`}
            </>) : (<>
              {payment==='pix' && 'Após confirmar, você receberá um QR Code Pix para pagamento instantâneo. O acesso é liberado após a confirmação.'}
              {payment==='card' && 'Recorrência mensal automática no cartão.'}
              {payment==='boleto' && 'O boleto será gerado após a confirmação. O acesso será liberado após a compensação bancária.'}
            </>)}</div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-3 font-semibold text-slate-900">Resumo da compra</h3>
            <div className="border-b border-slate-200 py-3"><p className="font-semibold text-slate-900">FlipForm {plan.name}</p><p className="text-xs text-slate-500">Assinatura mensal{plan.includesAi ? ' · com atendente de IA' : ''}</p></div>
            {trialDays > 0 && <div className="mt-3 flex justify-between text-sm"><span>Hoje</span><span className="font-semibold text-emerald-700">R$ 0,00 · {trialDays} dias grátis</span></div>}
            <div className="mt-3 flex justify-between border-t-2 border-slate-900 pt-3 font-bold text-slate-900"><span>{trialDays > 0 ? 'Depois do teste' : 'Total'}</span><span>{toBrl(total)}/mês</span></div>
            {trialDays > 0 && payment==='card' && <p className="mt-2 text-xs text-slate-500">Cupom de desconto, se tiver, é aplicado na página de pagamento do Stripe.</p>}

            <button type="button" onClick={handleSubmit} disabled={loading} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Preparando seu checkout seguro...' : trialDays > 0 ? `Começar ${trialDays} dias grátis` : 'Finalizar assinatura'}</button>
            {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <div className="mt-4 space-y-2 text-xs">
              <p>Seus dados protegidos com criptografia SSL</p>
              <p>{trialDays > 0 ? `Acesso imediato · ${trialDays} dias grátis` : 'Acesso após confirmação do pagamento'}</p>
              <p>Cancele quando quiser</p>
              <p>Arquitetura multi-tenant — dados isolados por cliente</p>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs"><strong>Ambiente seguro</strong><p>Não enviamos senha padrão por e-mail. Você receberá link seguro de primeiro acesso.</p></div>
            <p className="mt-4 text-center text-xs text-slate-500">Já tem conta? <a className="text-blue-600" href="https://app.flipform.com.br/login">Entrar</a></p>
            <p className="mt-1 text-center text-xs text-slate-500"><Link href="/legal/terms" className="underline">Termos</Link> · <Link href="/legal/privacy" className="underline">Privacidade</Link></p>
          </div>
        </aside>
      </div>
    </main>
  );
}
