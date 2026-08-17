'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConnectionHealthPanel, type ConnectionHealth } from './connection-health-panel';

export function WhatsAppConnectionHealthCard() {
  const [health, setHealth] = useState<ConnectionHealth>(null);
  const [connected, setConnected] = useState(false);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a saúde do WhatsApp.');
      setHealth(payload.health || null);
      setConnected(payload.connection?.status === 'connected');
      setRuntimeAvailable(Boolean(payload.runtimeAvailable));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar a saúde do WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function checkConnection() {
    setChecking(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/connection/validate', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível verificar a conexão do WhatsApp.');
      setHealth(payload.health || null);
      if (payload.health?.state === 'healthy') toast.success('Conexão do WhatsApp validada com a Meta.');
      else if (payload.health?.state === 'provider_error') toast.error('A Meta não respondeu à verificação. Tente novamente mais tarde.');
      else toast.error('A conexão do WhatsApp precisa de atenção. Veja o diagnóstico abaixo.');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível verificar a conexão do WhatsApp.');
    } finally {
      setChecking(false);
    }
  }

  if (loading || !connected || !health) return null;
  return <div className="px-6 pb-6 max-w-7xl">
    <ConnectionHealthPanel
      health={health}
      checking={checking}
      canCheck={Boolean(connected && runtimeAvailable)}
      onCheck={checkConnection}
    />
  </div>;
}
