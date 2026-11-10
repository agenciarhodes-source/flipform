'use client';

import { useEffect, useState } from 'react';
import { FileSignature, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type Data = {
  allowed: boolean;
  enabled?: boolean;
  hasToken?: boolean;
  checklists?: Array<{ id: string; name: string }>;
  templates?: Array<{ checklistId: string; templateId: string }>;
};

const FILLED = ['{{NOME COMPLETO}}', '{{TELEFONE}}', '{{CIDADE}}', '{{ESTADO}}', '{{TESE}}', '{{DATA}}'];

/**
 * Contracts by ZapSign: the API token and the ZapSign model of each case (document list). Only for
 * companies the Super Admin released; hidden for everyone else.
 */
export function ZapSignSettingsCard() {
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [models, setModels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch('/api/contracts/zapsign', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) { setData(null); return; }
    const body: Data = await response.json().catch(() => ({ allowed: false }));
    setData(body);
    setEnabled(!!body.enabled);
    setModels(Object.fromEntries((body.templates || []).map((item) => [item.checklistId, item.templateId])));
  };
  useEffect(() => { void load(); }, []);

  if (!data?.allowed) return null;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/contracts/zapsign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          apiToken: token.trim() || null,
          templates: Object.entries(models).map(([checklistId, templateId]) => ({ checklistId, templateId })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.');
      setToken('');
      if (body.warning) toast.warning(body.warning); else toast.success('Contratos salvos.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold flex items-center gap-2"><FileSignature className="w-4 h-4" />Contratos (ZapSign)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Quando a documentação de um caso fica completa no WhatsApp, a IA envia ao cliente o contrato do modelo daquela tese para assinar.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="zapsign-enabled" className="text-sm">{enabled ? 'Ligado' : 'Desligado'}</Label>
          <Switch id="zapsign-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="zapsign-token">Token da API do ZapSign</Label>
        <Input id="zapsign-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)}
          placeholder={data.hasToken ? 'Token salvo (cole outro só para trocar)' : 'Cole aqui o token (ZapSign › Configurações › Integração › API)'} />
        <p className="text-xs text-muted-foreground">Fica guardado criptografado e não aparece de novo.</p>
      </div>

      <div className="space-y-2">
        <Label>Modelo do ZapSign de cada tese</Label>
        <p className="text-xs text-muted-foreground">
          Cole o código do modelo (o final do endereço do modelo no ZapSign: app.zapsign.com.br/conta/modelos/<strong>CÓDIGO</strong>).
          Um modelo pode ter o contrato, o aditivo e os outros documentos juntos. Tese sem modelo não envia contrato.
        </p>
        {(data.checklists || []).length ? (
          <div className="space-y-2">
            {(data.checklists || []).map((checklist) => (
              <div key={checklist.id} className="grid gap-1 sm:grid-cols-[1fr_1.4fr] sm:items-center">
                <span className="text-sm">{checklist.name}</span>
                <Input value={models[checklist.id] || ''} maxLength={100} placeholder="Código do modelo"
                  onChange={(event) => setModels((current) => ({ ...current, [checklist.id]: event.target.value }))} />
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Cadastre antes as listas de documentos (as teses) em Atendimento WhatsApp.</p>}
      </div>

      <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
        <p>No modelo do ZapSign, o FlipForm preenche estes campos: {FILLED.join(', ')}.</p>
        <p>Qualquer outro campo do modelo (CPF, RG, endereço, estado civil...) o próprio cliente preenche no ZapSign antes de assinar.</p>
      </div>

      <Button onClick={() => void save()} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar contratos'}</Button>
    </Card>
  );
}
