'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * "Redefinir senha": whoever resets types the new password twice and passes it to the person by a
 * safe way. The person is signed out of every device and enters with the new password.
 */
export function PasswordResetDialog({ name, email, endpoint, askReason = false, onClose }: {
  name: string;
  email: string;
  endpoint: string;
  askReason?: boolean;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [reason, setReason] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const mismatch = confirmNewPassword.length > 0 && confirmNewPassword !== newPassword;
  const ready = newPassword.length >= 8 && newPassword === confirmNewPassword && (!askReason || reason.trim().length >= 10);

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmNewPassword, ...(askReason ? { reason } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível trocar a senha.');
      toast.success(`Senha de ${name} trocada. A pessoa foi desconectada e entra com a senha nova.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível trocar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><KeyRound className="w-4 h-4" />Redefinir senha</DialogTitle>
          <DialogDescription>
            Nova senha para <strong>{name}</strong> ({email}). A pessoa sai de todos os aparelhos e entra com a senha nova.
            Passe a senha por um meio seguro e peça para ela trocar depois, em “Alterar senha”.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="reset-new-password">Nova senha (mínimo 8 caracteres)</Label>
            <div className="relative">
              <Input id="reset-new-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)} maxLength={128} className="pr-10" />
              <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm-password">Repita a nova senha</Label>
            <Input id="reset-confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)} maxLength={128} />
            {mismatch ? <p className="text-xs text-destructive">As senhas não são iguais.</p> : null}
          </div>
          {askReason ? (
            <div className="space-y-1.5">
              <Label htmlFor="reset-reason">Como você confirmou que é a própria pessoa?</Label>
              <Textarea id="reset-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}
                placeholder="Ex.: pediu pelo WhatsApp do número cadastrado e confirmei por chamada" />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={!ready || saving}>{saving ? 'Salvando...' : 'Trocar senha'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
