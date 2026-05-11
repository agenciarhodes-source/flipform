'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';

export function InviteAcceptClient({ token, invite }: { token: string; invite: any }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (invite.expired || invite.inactive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-background">
        <Card className="max-w-md p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h1 className="font-heading text-2xl font-bold mb-2">Convite não disponível</h1>
          <p className="text-muted-foreground text-sm">
            {invite.expired ? 'Este convite expirou.' : `Este convite está ${invite.status === 'accepted' ? 'já aceito' : 'revogado'}.`}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Peça ao administrador um novo convite.</p>
        </Card>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/public/invites/${token}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Bem-vindo!');
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 via-background to-background">
      <Card className="w-full max-w-md p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-md bg-brand-600 flex items-center justify-center text-white"><Zap className="w-4 h-4" /></div>
          <span className="font-heading font-bold text-lg">FlipForm</span>
        </div>
        <div className="mb-5">
          <div className="text-xs text-muted-foreground mb-1">Você foi convidado a participar de</div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            {invite.tenant.name}
            <Badge variant="outline" className="capitalize">{invite.role}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Como <strong>{invite.email}</strong>. Defina seus dados abaixo para entrar.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Seu nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></div>
          <div><Label>Crie uma senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : <><CheckCircle2 className="w-4 h-4 mr-2" />Aceitar convite e entrar</>}
          </Button>
        </form>
      </Card>
    </div>
  );
}
