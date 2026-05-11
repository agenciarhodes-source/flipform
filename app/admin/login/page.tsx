'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@flipform.com.br');
  const [password, setPassword] = useState('');
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
      if (!res.ok) throw new Error(data.error || 'Falha no login');
      if (!data.platformAdmin) throw new Error('Esta conta não tem acesso administrativo.');
      toast.success('Bem-vindo ao painel da plataforma');
      router.push('/admin');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 bg-slate-800 border-slate-700">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-md bg-brand-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">FlipForm</div>
            <div className="font-heading font-bold text-lg">Plataforma Admin</div>
          </div>
        </div>
        <h2 className="font-heading text-xl font-bold mb-1">Acesso restrito</h2>
        <p className="text-sm text-slate-400 mb-5">Apenas administradores da plataforma.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-200">E-mail</Label>
            <Input id="email" className="bg-slate-900 border-slate-700 text-slate-100" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-200">Senha</Label>
            <Input id="password" type="password" className="bg-slate-900 border-slate-700 text-slate-100" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <div className="mt-5 text-center text-sm">
          <Link href="/login" className="text-slate-400 hover:text-slate-200">← Voltar ao login normal</Link>
        </div>
      </Card>
    </div>
  );
}
