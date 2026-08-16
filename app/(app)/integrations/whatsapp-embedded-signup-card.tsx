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
  connectedAt?: string | null;
  systemUserAssignedAt?: string | null;
  subscribedAt?: string | null;
  registeredAt?: string | null;
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
  const [registering, setRegistering] = useState(false);
  const [pin, setPin] = useState('');

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
      setPin('');
      toast.success('WhatsApp conectado ao FlipForm. Agora registre o número para concluir a ativação da Cloud API.');
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
    setPin('');
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

  async function registerPhone() {
    if (!/^\d{6}$/.test(pin)) {
      toast.error('Informe um PIN de 6 dígitos.');
      return;
    }
    setRegistering(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o número.');
      setPin('');
      toast.success('Número registrado na WhatsApp Cloud API.');
      await loadConnection();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível registrar o número.');
    } finally {
      setRegistering(false);
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o WhatsApp deste tenant? O vínculo será revogado no FlipForm e o histórico será preservado.')) return;
    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível desconectar o WhatsApp.');
      setPin('');
      toast.success('WhatsApp desconectado do FlipForm.');
      await loadConnection();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível desconectar o WhatsApp.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = connection?.status === 'connected';
  const registered = Boolean(connection?.registeredAt);
  return <div className="px-6 pb-6 max-w-7xl">
    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">WhatsApp Cloud API</h2>
          <p className="text-sm text-muted-foreground">Conexão oficial via Meta Embedded Signup. O WABA e o número ficam vinculados exclusivamente a esta empresa.</p>
        </div>
        <span className="rounded-full border bg-white px-2 py-1 text-xs">{loading ? 'Carregando' : connected ? registered ? 'Ativo' : 'Registro pendente' : 'Não conectado'}</span>
      </div>

      {connected && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Número</p><p className="text-sm font-medium">{connection?.displayPhoneNumber || 'Número conectado'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Nome verificado</p><p className="text-sm font-medium">{connection?.verifiedName || '-'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">WABA</p><p className="text-sm font-medium">{connection?.wabaName || 'Conta WhatsApp Business'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Qualidade</p><p className="text-sm font-medium">{connection?.qualityRating || '-'}</p></div>
      </div>}

      {!loading && !platformAvailable && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">O Embedded Signup ainda precisa ser configurado pelo Super Admin do FlipForm.</div>}
      {!loading && platformAvailable && !connected && <p className="text-sm text-muted-foreground">Conecte a conta oficial de WhatsApp Business desta empresa. O FlipForm validará o WABA e o número diretamente na Meta antes de salvar.</p>}

      {connected && <div className={`rounded-md border p-4 ${registered ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={`text-sm font-medium ${registered ? 'text-emerald-900' : 'text-amber-900'}`}>Registro do número na Cloud API: {registered ? 'concluído' : 'pendente'}</p>
            <p className={`mt-1 text-xs ${registered ? 'text-emerald-800' : 'text-amber-800'}`}>
              {registered
                ? 'O número está registrado para operação pela Cloud API. Você pode informar outro PIN abaixo apenas se precisar registrar novamente ou atualizar a verificação em duas etapas.'
                : 'Escolha um PIN de 6 dígitos para a verificação em duas etapas e conclua o registro. Guarde esse PIN em local seguro: o FlipForm não salva o PIN.'}
            </p>
          </div>
          {registered && connection?.registeredAt && <span className="text-[11px] text-emerald-800">Registrado em {new Date(connection.registeredAt).toLocaleString('pt-BR')}</span>}
        </div>
        <div className="mt-3 flex max-w-md flex-wrap gap-2">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="PIN de 6 dígitos"
            aria-label="PIN de 6 dígitos do WhatsApp"
            className="min-w-44 flex-1 rounded border bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-600"
            disabled={registering || connecting || disconnecting || !platformAvailable}
          />
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
            onClick={registerPhone}
            disabled={registering || connecting || disconnecting || !platformAvailable || pin.length !== 6}
          >
            {registering ? 'Registrando...' : registered ? 'Registrar novamente' : 'Registrar número'}
          </button>
        </div>
      </div>}

      <div className="flex flex-wrap gap-2">
        {platformAvailable && <button type="button" className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60" onClick={connect} disabled={connecting || disconnecting || registering}>{connecting ? 'Conectando...' : connected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}</button>}
        {connected && <button type="button" className="px-4 py-2 rounded border text-sm disabled:opacity-60" onClick={disconnect} disabled={connecting || disconnecting || registering}>{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>}
      </div>
      <p className="text-xs text-muted-foreground">As credenciais técnicas permanecem somente no servidor da plataforma. O PIN é enviado à Meta apenas no momento do registro e não é persistido pelo FlipForm. Inbox, webhook e envio usam exclusivamente o vínculo de número validado no servidor.</p>
    </div>
  </div>;
}
