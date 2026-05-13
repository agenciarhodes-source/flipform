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

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: 'Solicitação de acesso', companyName: 'N/A', password: 'bloqueado' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Este e-mail não possui acesso autorizado.');
      toast.success('Acesso autorizado. Redirecionando...');
      router.push('/dashboard');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 via-background to-background">
      <Card className="w-full max-w-md p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-md bg-brand-600 flex items-center justify-center text-white">
            <Zap className="w-4 h-4" />
          </div>
          <span className="font-heading font-bold text-lg">FlipForm</span>
        </div>
        <h2 className="font-heading text-2xl font-bold mb-2">Solicitar acesso</h2>
        <p className="text-muted-foreground text-sm mb-6">Apenas e-mails previamente autorizados podem acessar.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verificando...' : 'Solicitar acesso'}
          </Button>
        </form>
        <div className="mt-6 text-sm text-center text-muted-foreground">
          Já tem conta? <Link href="/login" className="text-primary font-medium hover:underline">Entrar</Link>
        </div>
      </Card>
    </div>
  );
}
