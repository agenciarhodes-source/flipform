'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildCampaignLink, CAMPAIGN_LINK_PLATFORMS, type CampaignLinkPlatform } from '@/lib/flip-ai/campaign-link';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
  }
}

/** Builds the tagged link of this attendant's chat, so every lead arrives with its campaign as origin. */
export function CampaignLinkBuilder({ publicPath, published }: { publicPath: string; published: boolean }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [platform, setPlatform] = useState<CampaignLinkPlatform>('meta_ads');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />Link de campanha
      </Button>
    );
  }

  const link = buildCampaignLink({ baseUrl: `${origin}${publicPath}`, platform, campaign, content });
  return (
    <div className="mt-4 w-full space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Link de campanha</p>
          <p className="text-xs text-muted-foreground">O lead que chegar por este link entra com a origem <strong>{link.expectedOrigin}</strong>.</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
      </div>
      {!published ? <p className="text-xs text-amber-700">O chat só atende depois que o atendente for publicado.</p> : null}
      <label className="block text-xs" htmlFor={`campaign-platform-${publicPath}`}>Onde o link vai ser usado
        <select id={`campaign-platform-${publicPath}`} value={platform}
          onChange={(event) => setPlatform(event.target.value as CampaignLinkPlatform)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          {CAMPAIGN_LINK_PLATFORMS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="block text-xs" htmlFor={`campaign-name-${publicPath}`}>Nome da campanha
        <Input id={`campaign-name-${publicPath}`} className="mt-1" value={campaign} maxLength={80}
          placeholder={platform === 'meta_ads' ? 'Opcional: em branco, a Meta preenche sozinha' : 'Ex.: maternidade rural outubro'}
          onChange={(event) => setCampaign(event.target.value)} />
      </label>
      <label className="block text-xs" htmlFor={`campaign-content-${publicPath}`}>Anúncio ou variação (opcional)
        <Input id={`campaign-content-${publicPath}`} className="mt-1" value={content} maxLength={80}
          placeholder="Ex.: video depoimento" onChange={(event) => setContent(event.target.value)} />
      </label>

      {link.platformField ? <>
        <CopyField label="Link do anúncio (endereço do chat)" value={link.baseUrl} />
        <CopyField label={link.platformField.label} value={link.platformField.value} />
        <p className="text-xs text-muted-foreground">Coloque o endereço no campo de link do anúncio e o texto acima no campo de parâmetros. Assim a plataforma monta o link completo.</p>
      </> : null}
      <CopyField label={link.platformField ? 'Link completo (para testar ou usar fora do anúncio)' : 'Link completo'} value={link.fullUrl} />
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <p className="text-muted-foreground">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="flex-1 break-all rounded-md bg-muted px-2 py-1.5">{value}</code>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`Copiar ${label}`}
          onClick={() => void copy(value)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
