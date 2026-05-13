'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Save, Building2, Palette, Image as ImageIcon, AlertTriangle, ExternalLink, Globe, ShieldCheck, Users as UsersIcon, Workflow, FileText, UsersRound } from 'lucide-react';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';

const SUGGESTED_COLORS = ['#2563EB', '#1D4ED8', '#7C3AED', '#0891B2', '#0D9488', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#0F172A'];
const SLUG_REGEX_FE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface TenantData {
  id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null;
  status: string; createdAt: string;
  _count: { tenantUsers: number; leads: number; forms: number; pipelines: number };
}

export function SettingsPageClient({ initialTenant, role }: { initialTenant: TenantData; role: string }) {
  const router = useRouter();
  const canEdit = can(role, 'SETTINGS_EDIT');
  const [tenant, setTenant] = useState<TenantData>(initialTenant);
  const [name, setName] = useState(initialTenant.name);
  const [slug, setSlug] = useState(initialTenant.slug);
  const [primaryColor, setPrimaryColor] = useState(initialTenant.primaryColor);
  const [logoUrl, setLogoUrl] = useState(initialTenant.logoUrl || '');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const slugValid = SLUG_REGEX_FE.test(slug);
  const colorValid = /^#[0-9A-Fa-f]{6}$/.test(primaryColor);
  const hasChanges = (
    name !== tenant.name || slug !== tenant.slug ||
    primaryColor !== tenant.primaryColor || (logoUrl || null) !== tenant.logoUrl
  );
  const slugChanged = slug !== tenant.slug;

  const initials = (tenant.name || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const save = async () => {
    if (!canEdit) return;
    if (!slugValid) { toast.error('Slug inválido. Use apenas letras minúsculas, números e hífens.'); return; }
    if (!colorValid) { toast.error('Cor inválida. Use formato #RRGGBB.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/tenant', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, primaryColor, logoUrl: logoUrl || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Configurações salvas!');
      if (data.tenant) setTenant({ ...tenant, ...data.tenant });
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  };


  const changePassword = async () => {
    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha.');
      toast.success(data.message || 'Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      router.push('/login');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar senha.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Configurações da Empresa</h1>
          <p className="text-muted-foreground text-sm">Personalize a identidade visual e dados da sua empresa.</p>
        </div>
        {canEdit && (
          <Button onClick={save} disabled={!hasChanges || !slugValid || !colorValid || saving}>
            <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />Você está visualizando como <strong>{role}</strong>. Apenas owner/admin podem editar.
        </div>
      )}

      {/* Preview da identidade */}
      <Card className="p-6" style={{ background: `linear-gradient(135deg, ${primaryColor}11 0%, transparent 70%)` }}>
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 border-2" style={{ borderColor: primaryColor }}>
            {logoUrl ? <AvatarImage src={logoUrl} alt={name} /> : null}
            <AvatarFallback className="text-lg font-bold" style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}>{initials || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-heading text-xl font-bold">{name || 'Sua empresa'}</h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Globe className="w-3 h-3" />flipform.com.br/<strong className="text-foreground">{slug || 'sua-empresa'}</strong></span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><ShieldCheck className="w-3 h-3" />{tenant.status}</Badge>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Criada em</div>
            <div className="font-medium text-foreground">{formatDate(tenant.createdAt)}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Identidade */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-600" />
            <h3 className="font-heading font-semibold">Identidade da empresa</h3>
          </div>
          <div>
            <Label>Nome da empresa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={80} />
          </div>
          <div>
            <Label>Slug único</Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">/</span>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={!canEdit} className={!slugValid && slug ? 'border-destructive' : ''} />
            </div>
            {!slugValid && slug && <p className="text-xs text-destructive mt-1">Use apenas letras minúsculas, números e hífens.</p>}
            {slugChanged && slugValid && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2 mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Alterar o slug pode quebrar URLs externas que referenciam <strong>{tenant.slug}</strong>.</span>
              </div>
            )}
          </div>
        </Card>

        {/* Branding */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-brand-600" />
            <h3 className="font-heading font-semibold">Branding visual</h3>
          </div>
          <div>
            <Label>Cor principal</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())} disabled={!canEdit} className="w-12 h-10 rounded-md cursor-pointer border" />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())} disabled={!canEdit} maxLength={7} className="font-mono" />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {SUGGESTED_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => canEdit && setPrimaryColor(c)} className={`w-7 h-7 rounded-md transition ${primaryColor.toUpperCase() === c ? 'ring-2 ring-offset-2 ring-foreground' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />Logo (URL)</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} placeholder="https://exemplo.com/logo.png" />
            <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar as iniciais como fallback.</p>
            {logoUrl && (
              <div className="mt-2 p-3 rounded-md border bg-muted/40 flex items-center gap-3">
                <img src={logoUrl} alt="Preview" className="w-12 h-12 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className="text-xs text-muted-foreground">Preview do logo</span>
              </div>
            )}
          </div>
        </Card>
      </div>


      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-600" />
          <h3 className="font-heading font-semibold">Alterar senha</h3>
        </div>
        <div>
          <Label>Senha atual</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <Label>Nova senha</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
        </div>
        <div>
          <Label>Confirmar nova senha</Label>
          <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} minLength={8} />
        </div>
        <Button onClick={changePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}>
          {changingPassword ? 'Alterando...' : 'Alterar senha'}
        </Button>
      </Card>

      {/* Estatísticas */}
      <Card className="p-5">
        <h3 className="font-heading font-semibold mb-4">Estatísticas da empresa</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><UsersRound className="w-3.5 h-3.5" />Usuários</div><div className="font-heading text-2xl font-bold mt-1">{tenant._count.tenantUsers}</div></div>
          <div className="rounded-md border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><UsersIcon className="w-3.5 h-3.5" />Leads</div><div className="font-heading text-2xl font-bold mt-1">{tenant._count.leads}</div></div>
          <div className="rounded-md border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="w-3.5 h-3.5" />Formulários</div><div className="font-heading text-2xl font-bold mt-1">{tenant._count.forms}</div></div>
          <div className="rounded-md border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Workflow className="w-3.5 h-3.5" />Pipelines</div><div className="font-heading text-2xl font-bold mt-1">{tenant._count.pipelines}</div></div>
        </div>
      </Card>
    </div>
  );
}
