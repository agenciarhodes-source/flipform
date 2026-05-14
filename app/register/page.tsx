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
  const [step, setStep] = useState<'email'|'code'|'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [onboardingToken, setOnboardingToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async () => {
    setLoading(true);
    const res = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await res.json();
    toast.success(data.message || 'Enviamos um código para o e-mail informado.');
    setStep('code');
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    const res = await fetch('/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Código inválido ou expirado'); setLoading(false); return; }
    setOnboardingToken(data.onboardingToken);
    setStep('password');
    setLoading(false);
  };

  const complete = async () => {
    setLoading(true);
    const res = await fetch('/api/auth/complete-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboardingToken, password, confirmPassword }) });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Falha ao concluir'); setLoading(false); return; }
    toast.success('Acesso ativado com sucesso');
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 via-background to-background">
      <Card className="w-full max-w-md p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6"><div className="w-9 h-9 rounded-md bg-brand-600 flex items-center justify-center text-white"><Zap className="w-4 h-4" /></div><span className="font-heading font-bold text-lg">FlipForm</span></div>
        {step === 'email' && <><h2 className="font-heading text-2xl font-bold mb-2">Informe seu e-mail autorizado</h2><p className="text-muted-foreground text-sm mb-6">Enviaremos um código de acesso para validação.</p><div className="space-y-4"><div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div><Button className="w-full" onClick={requestCode} disabled={loading}>{loading ? 'Enviando...' : 'Enviar código'}</Button></div></>}
        {step === 'code' && <><h2 className="font-heading text-2xl font-bold mb-2">Enviamos um código para o e-mail informado.</h2><div className="space-y-4"><div className="space-y-2"><Label htmlFor="code">Código (6 dígitos)</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} /></div><Button className="w-full" onClick={verifyCode} disabled={loading}>{loading ? 'Validando...' : 'Validar código'}</Button></div></>}
        {step === 'password' && <><h2 className="font-heading text-2xl font-bold mb-2">Crie sua senha de acesso</h2><div className="space-y-4"><div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar senha</Label><Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div><Button className="w-full" onClick={complete} disabled={loading}>{loading ? 'Concluindo...' : 'Ativar acesso'}</Button></div></>}
        <div className="mt-6 text-sm text-center text-muted-foreground">Já tem conta? <Link href="/login" className="text-primary font-medium hover:underline">Entrar</Link></div>
      </Card>
    </div>
  );
}
