'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WHATSAPP_CONNECTION_CHANGED_EVENT, CATALOG_CONNECTION_CHANGED_EVENT } from './connection-events';
import { WHATSAPP_NUMBERS_CHANGED } from './whatsapp-numbers-card';
import { ICON_TONES } from '@/lib/integration-catalog/catalog';
import { visibleApps, iconUrl, type PresentedApp } from '@/lib/integration-catalog/presentation';
import { buttonVariants } from '@/components/ui/button';
type Props = { apps: PresentedApp[]; catalogAvailable:boolean; planSlug:string|null; universal: boolean; sandbox: boolean; api: boolean; inboxOnly?: boolean;
  status: { whatsapp: number | null; instagram: number | null; meta: number | null } };
function savedStatus(count: number | null) {
  return count === null ? 'Status indisponível' : count === 0 ? 'Nenhum vínculo ativo registrado' : count + ' vínculo(s) ativo(s) registrado(s)';
}
export function ConnectionCatalog({ apps, catalogAvailable, planSlug, universal, sandbox, api, inboxOnly = false, status }: Props) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    const events = [WHATSAPP_CONNECTION_CHANGED_EVENT, WHATSAPP_NUMBERS_CHANGED, CATALOG_CONNECTION_CHANGED_EVENT];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, refresh));
    };
  }, [router]);
  const entries = visibleApps(apps,planSlug,universal,inboxOnly);
  const groups = [...new Set(entries.map(app=>app.category))];
  return <section className="space-y-4" aria-label="Catálogo de aplicativos">
    <p className="text-sm text-muted-foreground">Selecione um aplicativo para abrir suas configurações. Vínculos registrados não comprovam disponibilidade atual da API do fornecedor.</p>
    {!catalogAvailable && <p role="status" className="text-sm text-muted-foreground">Catálogo personalizado indisponível; exibindo a configuração padrão.</p>}
    {groups.map(category=><div key={category} className="space-y-3"><h2 className="font-semibold">{category}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {entries.filter(app=>app.category===category).map(app => {
        const anchor = app.id === 'asaas' && sandbox ? 'universal-sandbox' : app.anchor;
        const info = app.id === 'whatsapp' ? savedStatus(status.whatsapp) : app.id === 'instagram' ? savedStatus(status.instagram) :
          app.id === 'meta-ads' ? savedStatus(status.meta) : app.id === 'google-ads' ? 'Configuração de conversões disponível' :
          app.id === 'asaas' && sandbox ? 'Somente ambiente de testes' : 'Conector ainda não homologado';
        return <article key={app.id} className="rounded-xl border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3"><span aria-hidden="true" className={'w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-sm shrink-0 ' + (ICON_TONES[app.tone] || ICON_TONES.neutral)}>{iconUrl(app) ? <img src={iconUrl(app)!} alt="" className="w-full h-full object-contain rounded-xl" /> : app.glyph}</span><div><h2 className="font-semibold text-sm">{app.label}</h2><p className="text-xs text-muted-foreground">{app.description}</p></div></div>
          <p className="text-xs text-muted-foreground mt-auto">{info}</p>
          {anchor ? <a href={'#' + anchor} className={buttonVariants({variant:'outline',size:'sm'})}>Configurar</a> : <span className="text-xs text-muted-foreground">Em preparação</span>}
        </article>;
      })}
    </div></div>)}
    {api && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><article className="rounded-xl border bg-card p-4 flex flex-col gap-3"><div className="flex items-center gap-3"><span aria-hidden="true" className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-semibold text-sm shrink-0">API</span><div><h2 className="font-semibold text-sm">API do FlipForm</h2><p className="text-xs text-muted-foreground">Tokens, escopos e sistemas que consultam o FlipForm</p></div></div><p className="text-xs text-muted-foreground mt-auto">Verifique a autorização da empresa</p><a href="#flipform-api" className={buttonVariants({variant:'outline',size:'sm'})}>Gerenciar API</a></article></div>}
  </section>;
}
