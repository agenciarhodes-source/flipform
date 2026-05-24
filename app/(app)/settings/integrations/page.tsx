'use client';
import { useEffect, useState } from 'react';

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<any>({ metaPixelEnabled: false, gtmEnabled: false, ga4Enabled: false, googleAdsEnabled: false });
  const [events, setEvents] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  async function load() {
    const [s, e, l] = await Promise.all([fetch('/api/integrations').then(r=>r.json()), fetch('/api/integrations/kanban-events').then(r=>r.json()), fetch('/api/integrations/event-logs').then(r=>r.json())]);
    if (s.settings) setSettings(s.settings);
    setEvents(e.events || []);
    setLogs(l.logs || []);
  }
  useEffect(() => { load(); }, []);

  async function saveSettings() {
    await fetch('/api/integrations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    await load();
  }

  return <div className="p-6 space-y-4 max-w-5xl">
    <h1 className="text-3xl font-bold">Integrações</h1>
    <p className="text-sm text-muted-foreground">Configure seus pixels, tags e eventos de conversão sem precisar alterar código.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-white p-4 space-y-2"><h2 className="font-semibold">Google</h2>
        <input className="w-full border rounded p-2" placeholder="GTM-1234567" value={settings.gtmContainerId||''} onChange={e=>setSettings({...settings, gtmContainerId:e.target.value, gtmEnabled:true})} />
        <input className="w-full border rounded p-2" placeholder="G-XXXXXXXXXX" value={settings.ga4MeasurementId||''} onChange={e=>setSettings({...settings, ga4MeasurementId:e.target.value, ga4Enabled:true})} />
        <input className="w-full border rounded p-2" placeholder="AW-123456789" value={settings.googleAdsId||''} onChange={e=>setSettings({...settings, googleAdsId:e.target.value, googleAdsEnabled:true})} />
        <input className="w-full border rounded p-2" placeholder="Google Ads Label" value={settings.googleAdsLabel||''} onChange={e=>setSettings({...settings, googleAdsLabel:e.target.value})} />
      </div>
      <div className="rounded-lg border bg-white p-4 space-y-2"><h2 className="font-semibold">Meta / Facebook</h2>
        <input className="w-full border rounded p-2" placeholder="123456789012345" value={settings.metaPixelId||''} onChange={e=>setSettings({...settings, metaPixelId:e.target.value, metaPixelEnabled:true})} />
      </div>
    </div>
    <button className="px-4 py-2 rounded bg-black text-white" onClick={saveSettings}>Salvar</button>

    <div className="rounded-lg border bg-white p-4"><h2 className="font-semibold mb-2">Eventos do Kanban</h2><p className="text-sm text-muted-foreground">Mapeamento atual: {events.length} evento(s).</p></div>
    <div className="rounded-lg border bg-white p-4"><h2 className="font-semibold mb-2">Histórico de eventos</h2><p className="text-sm text-muted-foreground">Últimos registros: {logs.length}</p></div>
  </div>;
}
