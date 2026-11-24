'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { MfaLoginStep } from '@/components/mfa/mfa-login-step';

type LoginTenantChoice = { id: string; name: string; slug: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [tenantChoices, setTenantChoices] = useState<LoginTenantChoice[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const goIn = (data: any) => {
    toast.success('Bem-vindo!');
    if (data.platformAdmin) {
      router.push('/admin');
    } else if (data.businessGroupAccess) {
      router.push('/group');
    } else {
      router.push('/dashboard');
    }
    router.refresh();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(tenantChoices.length ? { tenantId: selectedTenantId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no login');
      if (data.tenantSelectionRequired) {
        if (!Array.isArray(data.tenants) || data.tenants.length < 2) {
          throw new Error('Não foi possível selecionar a empresa.');
        }
        setTenantChoices(data.tenants as LoginTenantChoice[]);
        setSelectedTenantId('');
        return;
      }
      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        return;
      }
      goIn(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 to-brand-800 text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-md bg-white/20 backdrop-blur flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <span className="font-heading font-bold text-xl">FlipForm</span>
        </div>
        <div>
          <h1 className="font-heading text-4xl font-bold leading-tight mb-4">
            Capture, organize e converta leads em escala.
          </h1>
          <p className="text-brand-100 text-lg">
            Formulários personalizáveis, Kanban visual e dashboard em tempo real — tudo num único lugar.
          </p>
        </div>
        <div className="text-brand-100 text-sm">
          © {new Date().getFullYear()} FlipForm — Multi-empresa SaaS
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <Card className="w-full max-w-md p-8 shadow-sm border">
          <div className="mb-6 lg:hidden flex items-center gap-2 justify-center">
            <div className="w-9 h-9 rounded-md bg-brand-600 flex items-center justify-center text-white">
              <Zap className="w-4 h-4" />
            </div>
            <span className="font-heading font-bold text-lg">FlipForm</span>
          </div>
          <h2 className="font-heading text-2xl font-bold mb-2">{mfaToken ? 'Verificação em duas etapas' : tenantChoices.length ? 'Escolha sua empresa' : 'Entrar'}</h2>
          {!mfaToken && <p className="text-muted-foreground text-sm mb-6">{tenantChoices.length ? 'Você tem acesso a mais de uma empresa. Escolha qual deseja acessar.' : 'Acesse sua conta para gerenciar seus leads.'}</p>}
          {mfaToken ? (
            <MfaLoginStep mfaToken={mfaToken} onSuccess={goIn} onCancel={() => { setMfaToken(null); setPassword(''); setTenantChoices([]); setSelectedTenantId(''); }} />
          ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {tenantChoices.length ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="login-tenant">Empresa</Label>
                  <select id="login-tenant" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={loading} required>
                    <option value="">Selecione a empresa</option>
                    {tenantChoices.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
                  </select>
                </div>
                <Button type="button" variant="ghost" className="w-full" disabled={loading}
                  onClick={() => { setTenantChoices([]); setSelectedTenantId(''); setPassword(''); }}>
                  Voltar para o login
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={loading || (tenantChoices.length > 0 && !selectedTenantId)}>
              {loading ? 'Entrando...' : tenantChoices.length ? 'Entrar na empresa' : 'Entrar'}
            </Button>
          </form>
          )}
          <div className="mt-3 text-xs text-center text-muted-foreground">
            <Link href="/legal/terms" className="underline">Termos</Link>{' · '}
            <Link href="/legal/privacy" className="underline">Privacidade</Link>{' · '}
            <Link href="/legal/support" className="underline">Suporte</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
