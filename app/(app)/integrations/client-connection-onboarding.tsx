'use client';

import { useCallback, useEffect, useState } from 'react';

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

function whatsappDisconnected(): ChannelSummary {
  return {
    level: 'not_connected',
    label: 'Não conectado',
    detail: 'WhatsApp Business é opcional. Conecte somente se quiser usar mensagens e automações deste canal.',
    actionLabel: 'Ver WhatsApp',
    href: '#whatsapp-connection',
    usable: false,
  };
}

function whatsappSummary(payload: any): ChannelSummary {
  const connected = payload.connection?.status === 'connected';
  const health = payload.health?.state as HealthState | undefined;
  if (!connected) return whatsappDisconnected();

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
  const [whatsapp, setWhatsapp] = useState<ChannelSummary>(LOADING_SUMMARY);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection', { cache: 'no-store' });
      if (response.ok) {
        setWhatsapp(whatsappSummary(await readPayload(response)));
      } else {
        setWhatsapp(whatsappDisconnected());
      }
    } catch {
      setWhatsapp(whatsappDisconnected());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6" aria-labelledby="connection-onboarding-title">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-br from-brand-50 via-white to-slate-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-brand-700">Canal de atendimento</p>
              <h2 id="connection-onboarding-title" className="mt-1 text-2xl font-semibold tracking-tight">WhatsApp Business</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Conecte o WhatsApp oficial da sua empresa para usar atendimento, Inbox e automações no FlipForm. A configuração técnica da plataforma permanece centralizada e sua empresa autoriza apenas o próprio número.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                {whatsapp.usable ? 'Canal pronto' : 'Canal não conectado'}
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

        <div className="p-4 sm:p-5">
          <article className="rounded-xl border bg-background p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cloud API oficial</p>
                <h3 className="mt-1 text-lg font-semibold">WhatsApp</h3>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(whatsapp.level)}`}>
                {whatsapp.label}
              </span>
            </div>
            <p className="mt-4 min-h-10 text-sm text-muted-foreground">{whatsapp.detail}</p>
            <a
              href={whatsapp.href}
              aria-disabled={whatsapp.level === 'loading'}
              className={`mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium ${whatsapp.level === 'loading' ? 'pointer-events-none opacity-50' : 'hover:bg-muted/60'}`}
            >
              {whatsapp.actionLabel}
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
