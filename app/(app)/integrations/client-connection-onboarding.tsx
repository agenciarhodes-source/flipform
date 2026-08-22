'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type HealthState =
  | 'healthy'
  | 'degraded'
  | 'action_required'
  | 'expired'
  | 'revoked'
  | 'provider_error'
  | 'not_connected';

type ChannelLevel = 'loading' | 'ready' | 'attention' | 'action_required' | 'not_connected';

type ChannelSummary = {
  level: ChannelLevel;
  label: string;
  detail: string;
  actionLabel: string;
  href: string;
  usable: boolean;
};

const BLOCKING_HEALTH = new Set<HealthState>(['action_required', 'expired', 'revoked']);

async function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

function badgeClass(level: ChannelLevel) {
  if (level === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (level === 'attention') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (level === 'action_required') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function optionalDisconnected(channel: 'Instagram' | 'WhatsApp', href: string): ChannelSummary {
  return {
    level: 'not_connected',
    label: 'Não conectado',
    detail: `${channel} é opcional. Conecte somente se quiser usar mensagens e automações deste canal.`,
    actionLabel: `Ver ${channel}`,
    href,
    usable: false,
  };
}

function instagramSummary(payload: any): ChannelSummary {
  const connected = payload.connection?.status === 'connected';
  const health = payload.health?.state as HealthState | undefined;
  if (!connected) return optionalDisconnected('Instagram', '#instagram-connection');

  const account = payload.connection?.username ? `@${payload.connection.username}` : 'Conta profissional conectada';
  if (health && BLOCKING_HEALTH.has(health)) {
    return {
      level: 'action_required',
      label: payload.health?.label || 'Ação necessária',
      detail: `${account}. ${payload.health?.summary || 'Reconecte a conta para continuar usando o canal.'}`,
      actionLabel: 'Reconectar Instagram',
      href: '#instagram-connection',
      usable: false,
    };
  }

  if (health === 'degraded' || health === 'provider_error') {
    return {
      level: 'attention',
      label: payload.health?.label || 'Conectado com atenção',
      detail: `${account}. ${payload.health?.summary || 'A conexão existe, mas vale revalidar a saúde do canal.'}`,
      actionLabel: 'Ver conexão',
      href: '#instagram-connection',
      usable: true,
    };
  }

  return {
    level: 'ready',
    label: payload.health?.label || 'Pronto',
    detail: `${account}. O canal está conectado e pronto para as automações disponíveis.`,
    actionLabel: 'Ver conexão',
    href: '#instagram-connection',
    usable: true,
  };
}

function whatsappSummary(payload: any): ChannelSummary {
  const connected = payload.connection?.status === 'connected';
  const health = payload.health?.state as HealthState | undefined;
  if (!connected) return optionalDisconnected('WhatsApp', '#whatsapp-connection');

  const phone = payload.connection?.displayPhoneNumber || 'Número conectado';
  if (!payload.runtimeAvailable) {
    return {
      level: 'action_required',
      label: 'Conexão precisa de atenção',
      detail: `${phone}. O canal está conectado, mas ainda não está pronto para operar.`,
      actionLabel: 'Ver conexão',
      href: '#whatsapp-connection',
      usable: false,
    };
  }

  if (!payload.connection?.registeredAt) {
    return {
      level: 'action_required',
      label: 'Ativação pendente',
      detail: `${phone}. Falta concluir a ativação para usar a Cloud API.`,
      actionLabel: 'Concluir ativação',
      href: '#whatsapp-connection',
      usable: false,
    };
  }

  if (health && BLOCKING_HEALTH.has(health)) {
    return {
      level: 'action_required',
      label: payload.health?.label || 'Ação necessária',
      detail: `${phone}. ${payload.health?.summary || 'Reconecte o WhatsApp para continuar usando o canal.'}`,
      actionLabel: 'Reconectar WhatsApp',
      href: '#whatsapp-connection',
      usable: false,
    };
  }

  if (health === 'degraded' || health === 'provider_error') {
    return {
      level: 'attention',
      label: payload.health?.label || 'Conectado com atenção',
      detail: `${phone}. ${payload.health?.summary || 'A conexão existe, mas vale revalidar a saúde do canal.'}`,
      actionLabel: 'Ver conexão',
      href: '#whatsapp-connection',
      usable: true,
    };
  }

  return {
    level: 'ready',
    label: payload.health?.label || 'Pronto',
    detail: `${phone}. O número está conectado, registrado e pronto para a Cloud API.`,
    actionLabel: 'Ver conexão',
    href: '#whatsapp-connection',
    usable: true,
  };
}

const LOADING_SUMMARY: ChannelSummary = {
  level: 'loading',
  label: 'Verificando...',
  detail: 'Consultando o estado atual deste canal.',
  actionLabel: 'Aguarde',
  href: '#',
  usable: false,
};

export function ClientConnectionOnboarding() {
  const [instagram, setInstagram] = useState<ChannelSummary>(LOADING_SUMMARY);
  const [whatsapp, setWhatsapp] = useState<ChannelSummary>(LOADING_SUMMARY);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [instagramResult, whatsappResult] = await Promise.allSettled([
      fetch('/api/integrations/instagram/connection', { cache: 'no-store' }),
      fetch('/api/integrations/whatsapp/connection', { cache: 'no-store' }),
    ]);

    if (instagramResult.status === 'fulfilled' && instagramResult.value.ok) {
      setInstagram(instagramSummary(await readPayload(instagramResult.value)));
    } else {
      setInstagram(optionalDisconnected('Instagram', '#instagram-connection'));
    }

    if (whatsappResult.status === 'fulfilled' && whatsappResult.value.ok) {
      setWhatsapp(whatsappSummary(await readPayload(whatsappResult.value)));
    } else {
      setWhatsapp(optionalDisconnected('WhatsApp', '#whatsapp-connection'));
    }

    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedChannels = useMemo(
    () => [instagram, whatsapp].filter(channel => channel.usable).length,
    [instagram, whatsapp],
  );

  const cards = [
    {
      title: 'Instagram',
      eyebrow: 'Comentários e Direct · opcional',
      summary: instagram,
    },
    {
      title: 'WhatsApp',
      eyebrow: 'Cloud API oficial · opcional',
      summary: whatsapp,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6" aria-labelledby="connection-onboarding-title">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-br from-brand-50 via-white to-slate-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-brand-700">Canais adicionais</p>
              <h2 id="connection-onboarding-title" className="mt-1 text-2xl font-semibold tracking-tight">Conecte somente o que quiser usar</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Instagram e WhatsApp são opcionais. As configurações técnicas da plataforma ficam centralizadas no FlipForm; sua empresa apenas autoriza a própria conta quando desejar.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                {connectedChannels}/2 canais conectados
              </span>
              <button
                type="button"
                onClick={() => void load()}
                disabled={refreshing}
                className="rounded-md border bg-white px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                {refreshing ? 'Atualizando...' : 'Atualizar status'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          {cards.map(({ title, eyebrow, summary }) => (
            <article key={title} className="rounded-xl border bg-background p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
                  <h3 className="mt-1 text-lg font-semibold">{title}</h3>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(summary.level)}`}>
                  {summary.label}
                </span>
              </div>
              <p className="mt-4 min-h-10 text-sm text-muted-foreground">{summary.detail}</p>
              <a
                href={summary.href}
                aria-disabled={summary.level === 'loading'}
                className={`mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium ${summary.level === 'loading' ? 'pointer-events-none opacity-50' : 'hover:bg-muted/60'}`}
              >
                {summary.actionLabel}
              </a>
            </article>
          ))}
        </div>

        {instagram.usable && <div className="border-t bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Automações do Instagram</p>
              <p className="mt-1 text-xs text-muted-foreground">Seu Instagram já pode usar automação de comentário → mensagem privada.</p>
            </div>
            <Link href="/automations" className="w-fit rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              Criar automação
            </Link>
          </div>
        </div>}
      </div>
    </section>
  );
}
