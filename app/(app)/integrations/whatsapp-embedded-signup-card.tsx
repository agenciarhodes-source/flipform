'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

declare global {
  interface Window {
    FB?: any;
  }
}

type Connection = {
  status: string;
  wabaName?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  codeVerificationStatus?: string | null;
  connectedAt?: string | null;
  subscribedAt?: string | null;
  tokenExpiresAt?: string | null;
} | null;

type SignupConfig = {
  appId: string;
  configId: string;
  graphApiVersion: string;
  state: string;
};

let sdkPromise: Promise<void> | null = null;

function ensureFacebookSdk(appId: string, version: string) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Navegador indisponível.'));
  const init = () => {
    if (!window.FB) throw new Error('SDK da Meta não foi carregado.');
    window.FB.init({ appId, cookie: false, xfbml: false, version });
  };
  if (window.FB) {
    init();
    return Promise.resolve();
  }
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
      const script = existing || document.createElement('script');
      const timeout = window.setTimeout(() => reject(new Error('Tempo excedido ao carregar a Meta.')), 12_000);
      const done = () => {
        window.clearTimeout(timeout);
        try { init(); resolve(); } catch (error) { reject(error); }
      };
      if (window.FB) return done();
      script.addEventListener('load', done, { once: true });
      script.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error('Não foi possível carregar o SDK da Meta.'));
      }, { once: true });
      if (!existing) {
        script.id = 'facebook-jssdk';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
        document.head.appendChild(script);
      }
    });
  }
  return sdkPromise.then(() => init());
}

export function WhatsAppEmbeddedSignupCard() {
  const [connection, setConnection] = useState<Connection>(null);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const stateRef = useRef<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);
  const completingRef = useRef(false);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o WhatsApp.');
      setConnection(data.connection || null);
      setPlatformAvailable(Boolean(data.platformAvailable));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar o WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnection(); }, [loadConnection]);

  const completeIfReady = useCallback(async () => {
    const state = stateRef.current;
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!state || !code || !session || completingRef.current) return;
    completingRef.current = true;
    try {
      const response = await fetch('/api/integrations/whatsapp/embedded-signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          state,
          wabaId: session.wabaId,
          phoneNumberId: session.phoneNumberId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a conexão do WhatsApp.');
      toast.success('WhatsApp conectado ao FlipForm.');
      await loadConnection();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível concluir a conexão do WhatsApp.');
    } finally {
      stateRef.current = null;
      codeRef.current = null;
      sessionRef.current = null;
      completingRef.current = false;
      setConnecting(false);
    }
  }, [loadConnection]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      let payload: any = event.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (payload.event === 'FINISH') {
        const wabaId = String(payload.data?.waba_id || '');
        const phoneNumberId = String(payload.data?.phone_number_id || '');
        if (!/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneNumberId)) {
          toast.error('A Meta não retornou os ativos do WhatsApp esperados.');
          setConnecting(false);
          return;
        }
        sessionRef.current = { wabaId, phoneNumberId };
        void completeIfReady();
      } else if (payload.event === 'CANCEL') {
        stateRef.current = null;
        codeRef.current = null;
        sessionRef.current = null;
        setConnecting(false);
        toast.error('A conexão do WhatsApp foi cancelada.');
      } else if (payload.event === 'ERROR') {
        stateRef.current = null;
        codeRef.current = null;
        sessionRef.current = null;
        setConnecting(false);
        toast.error('A Meta informou um erro no Embedded Signup.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [completeIfReady]);

  async function connect() {
    setConnecting(true);
    stateRef.current = null;
    codeRef.current = null;
    sessionRef.current = null;
    completingRef.current = false;
    try {
      const response = await fetch('/api/integrations/whatsapp/embedded-signup/config', { method: 'POST' });
      const config = await response.json() as SignupConfig & { error?: string };
      if (!response.ok) throw new Error(config.error || 'Não foi possível iniciar o WhatsApp Embedded Signup.');
      await ensureFacebookSdk(config.appId, config.graphApiVersion);
      stateRef.current = config.state;

      window.FB.login((loginResponse: any) => {
        const code = loginResponse?.authResponse?.code;
        if (typeof code !== 'string' || !code) {
          stateRef.current = null;
          setConnecting(false);
          toast.error('A Meta não retornou o código de autorização do WhatsApp.');
          return;
        }
        codeRef.current = code;
        void completeIfReady();
      }, {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      });
    } catch (error: any) {
      stateRef.current = null;
      codeRef.current = null;
      sessionRef.current = null;
      setConnecting(false);
      toast.error(error.message || 'Não foi possível iniciar a conexão do WhatsApp.');
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o WhatsApp deste tenant? O vínculo será revogado no FlipForm e o histórico será preservado.')) return;
    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível desconectar o WhatsApp.');
      toast.success('WhatsApp desconectado do FlipForm.');
      await loadConnection();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível desconectar o WhatsApp.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = connection?.status === 'connected';
  return <div className="px-6 pb-6 max-w-7xl">
    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">WhatsApp Cloud API</h2>
          <p className="text-sm text-muted-foreground">Conexão oficial via Meta Embedded Signup. As credenciais ficam isoladas por empresa.</p>
        </div>
        <span className="rounded-full border bg-white px-2 py-1 text-xs">{loading ? 'Carregando' : connected ? 'Conectado' : connection?.status === 'expired' ? 'Expirado' : 'Não conectado'}</span>
      </div>

      {connected && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Número</p><p className="text-sm font-medium">{connection?.displayPhoneNumber || 'Número conectado'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Nome verificado</p><p className="text-sm font-medium">{connection?.verifiedName || '-'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">WABA</p><p className="text-sm font-medium">{connection?.wabaName || 'Conta WhatsApp Business'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Qualidade</p><p className="text-sm font-medium">{connection?.qualityRating || '-'}</p></div>
      </div>}

      {!loading && !platformAvailable && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">O Embedded Signup ainda precisa ser configurado pelo Super Admin do FlipForm.</div>}
      {!loading && platformAvailable && !connected && <p className="text-sm text-muted-foreground">Conecte a conta oficial de WhatsApp Business desta empresa. O FlipForm validará o WABA e o número diretamente na Meta antes de salvar.</p>}

      <div className="flex flex-wrap gap-2">
        {platformAvailable && <button type="button" className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60" onClick={connect} disabled={connecting || disconnecting}>{connecting ? 'Conectando...' : connected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}</button>}
        {connected && <button type="button" className="px-4 py-2 rounded border text-sm disabled:opacity-60" onClick={disconnect} disabled={connecting || disconnecting}>{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>}
      </div>
      <p className="text-xs text-muted-foreground">Este passo cria o vínculo seguro com a Meta. O Inbox e o envio/recebimento de mensagens entram nos próximos módulos.</p>
    </div>
  </div>;
}
