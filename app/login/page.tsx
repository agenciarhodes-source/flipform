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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@leadflow.com');
  const [password, setPassword] = useState('demo123');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no login');
      toast.success('Bem-vindo!');
      if (data.platformAdmin) {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
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
          <h2 className="font-heading text-2xl font-bold mb-2">Entrar</h2>
          <p className="text-muted-foreground text-sm mb-6">Acesse sua conta para gerenciar seus leads.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-6 text-sm text-center text-muted-foreground">
            Não tem conta? <Link href="/register" className="text-primary font-medium hover:underline">Cadastre sua empresa</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
