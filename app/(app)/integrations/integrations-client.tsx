'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const providers = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'gtm', label: 'GTM' },
  { value: 'ga4', label: 'GA4' },
];
const eventNames = ['Lead', 'CompleteRegistration', 'Contact', 'QualifiedLead', 'InitiateCheckout', 'Purchase', 'CustomEvent'];
const matchTypes = [
  { value: 'exact', label: 'Exatamente igual' },
  { value: 'contains', label: 'Contém' },
  { value: 'starts_with', label: 'Começa com' },
];
const whatsappSuggestions = [
  { name: 'Novo lead', triggerPhrase: '✅ Novo lead', eventName: 'Lead' },
  { name: 'Lead qualificado', triggerPhrase: '✅ Lead qualificado', eventName: 'QualifiedLead' },
  { name: 'Orçamento enviado', triggerPhrase: '✅ Orçamento enviado', eventName: 'InitiateCheckout' },
  { name: 'Pedido realizado', triggerPhrase: '✅ Pedido realizado', eventName: 'Purchase' },
  { name: 'Pagamento confirmado', triggerPhrase: '✅ Pagamento confirmado', eventName: 'Purchase' },
];

export function IntegrationsClient() {
  const [settings, setSettings] = useState<any>({ metaPixelEnabled: false, gtmEnabled: false, ga4Enabled: false, googleAdsEnabled: false });
  const [events, setEvents] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [whatsappTriggers, setWhatsappTriggers] = useState<any[]>([]);
  const [whatsappForm, setWhatsappForm] = useState<any>({ name: '', orderIndex: 0, triggerPhrase: '', matchType: 'exact', eventName: 'Lead', currency: 'BRL', oncePerLead: true, enabled: true });
  const [whatsappTestText, setWhatsappTestText] = useState('✅ Lead qualificado');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<any>({ provider: 'meta', eventName: 'Lead', enabled: true, currency: 'BRL' });

  async function load() {
    setLoading(true);
    try {
      const [s, e, l] = await Promise.all([
        fetch('/api/integrations').then(r=>r.json()),
        fetch('/api/integrations/events').then(r=>r.json()),
        fetch('/api/integrations/event-logs').then(r=>r.json()),
      ]);
      const wf = await fetch('/api/integrations/whatsapp-funnel').then(r=>r.json());
      if (s.settings) setSettings({ ...s.settings, metaAccessToken: '', ga4ApiSecret: '' });
      setEvents(e.events || []);
      setPipelines(e.pipelines || []);
      setLogs(l.logs || []);
      setWhatsappTriggers(wf.triggers || []);
      const firstPipeline = e.pipelines?.[0];
      const firstStage = firstPipeline?.stages?.[0];
      setForm((prev: any) => ({ ...prev, pipelineId: prev.pipelineId || firstPipeline?.id || '', stageId: prev.stageId || firstStage?.id || '' }));
    } catch {
      toast.error('Não foi possível carregar integrações.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const selectedPipeline = useMemo(() => pipelines.find((p) => p.id === form.pipelineId), [pipelines, form.pipelineId]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar integrações.');
      setSettings({ ...data.settings, metaAccessToken: '', ga4ApiSecret: '' });
      toast.success('Integrações salvas com sucesso.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar integrações.');
    } finally {
      setSaving(false);
    }
  }

  async function testMeta() {
    setTesting(true);
    try {
      const res = await fetch('/api/integrations/test-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'meta', eventName: 'Lead' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason || data.error || 'Falha ao testar evento.');
      toast.success(data.reason || 'Evento de teste registrado.');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Falha ao testar evento.');
    } finally {
      setTesting(false);
    }
  }

  async function addEvent() {
    try {
      const res = await fetch('/api/integrations/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar evento.');
      toast.success('Evento do funil criado.');
      setForm({ provider: 'meta', eventName: 'Lead', enabled: true, currency: 'BRL', pipelineId: form.pipelineId, stageId: form.stageId });
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar evento.');
    }
  }

  async function toggleEvent(event: any) {
    const res = await fetch(`/api/integrations/events/${event.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, enabled: !event.enabled }) });
    if (!res.ok) toast.error('Não foi possível atualizar o evento.');
    await load();
  }

  async function deleteEvent(id: string) {
    if (!confirm('Excluir este evento do funil?')) return;
    const res = await fetch(`/api/integrations/events/${id}`, { method: 'DELETE' });
    if (!res.ok) toast.error('Não foi possível excluir o evento.'); else toast.success('Evento excluído.');
    await load();
  }

  async function addWhatsappTrigger() {
    try {
      const editingId = whatsappForm.id;
      const res = await fetch(editingId ? `/api/integrations/whatsapp-funnel/${editingId}` : '/api/integrations/whatsapp-funnel', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...whatsappForm, orderIndex: Number(whatsappForm.orderIndex || whatsappTriggers.length + 1) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar frase-gatilho.');
      toast.success(editingId ? 'Frase-gatilho atualizada.' : 'Frase-gatilho criada.');
      setWhatsappForm({ name: '', orderIndex: whatsappTriggers.length + 2, triggerPhrase: '', matchType: 'exact', eventName: 'Lead', currency: 'BRL', oncePerLead: true, enabled: true });
      await load();
    } catch (error: any) { toast.error(error.message || 'Erro ao criar frase-gatilho.'); }
  }

  async function toggleWhatsappTrigger(trigger: any) {
    const res = await fetch(`/api/integrations/whatsapp-funnel/${trigger.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...trigger, enabled: !trigger.enabled }) });
    if (!res.ok) toast.error('Não foi possível atualizar a frase-gatilho.');
    await load();
  }

  async function deleteWhatsappTrigger(id: string) {
    if (!confirm('Excluir esta frase-gatilho do Funil WhatsApp?')) return;
    const res = await fetch(`/api/integrations/whatsapp-funnel/${id}`, { method: 'DELETE' });
    if (!res.ok) toast.error('Não foi possível excluir a frase-gatilho.'); else toast.success('Frase-gatilho excluída.');
    await load();
  }

  async function testWhatsappTrigger() {
    const res = await fetch('/api/integrations/whatsapp-funnel/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: whatsappTestText, dryRun: true }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'Falha ao testar gatilho.');
    if (data.matched) toast.success(`Gatilho encontrado: ${data.matched.name} → ${data.matched.eventName}`); else toast.info('Nenhuma frase ativa corresponde ao texto testado.');
  }

  return <div className="p-6 space-y-6 max-w-7xl">
    <div>
      <h1 className="text-3xl font-bold">Integrações</h1>
      <p className="text-sm text-muted-foreground mt-1">Configure os pixels e eventos para otimizar suas campanhas com base no avanço real dos leads no funil.</p>
    </div>

    {loading && <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Carregando integrações...</div>}

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div><h2 className="font-semibold text-lg">Meta Ads</h2><p className="text-sm text-muted-foreground">Conecte seu Pixel e Token da API de Conversões para enviar eventos qualificados para o Meta.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.metaPixelEnabled} onChange={e=>setSettings({...settings, metaPixelEnabled:e.target.checked})} /> Ativar integração Meta</label>
        <input className="w-full border rounded p-2" placeholder="Meta Pixel ID" value={settings.metaPixelId||''} onChange={e=>setSettings({...settings, metaPixelId:e.target.value})} />
        <input className="w-full border rounded p-2" type="password" placeholder={settings.metaAccessTokenMasked || 'Token da API de Conversões'} value={settings.metaAccessToken||''} onChange={e=>setSettings({...settings, metaAccessToken:e.target.value})} />
        {settings.metaAccessTokenMasked && <p className="text-xs text-muted-foreground">Token salvo: {settings.metaAccessTokenMasked}</p>}
        <input className="w-full border rounded p-2" placeholder="Código de teste da Meta (opcional)" value={settings.metaTestEventCode||''} onChange={e=>setSettings({...settings, metaTestEventCode:e.target.value})} />
        <p className="text-xs text-muted-foreground">O token da API é armazenado com segurança e nunca será exibido novamente.</p>
        <div className="flex gap-2"><button className="px-4 py-2 rounded bg-black text-white disabled:opacity-60" onClick={saveSettings} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button><button className="px-4 py-2 rounded border disabled:opacity-60" onClick={testMeta} disabled={testing}>{testing ? 'Testando...' : 'Enviar evento de teste'}</button></div>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div><h2 className="font-semibold text-lg">Google</h2><p className="text-sm text-muted-foreground">Configure GTM, Google Ads e eventos de conversão para mensurar o desempenho das campanhas.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.gtmEnabled} onChange={e=>setSettings({...settings, gtmEnabled:e.target.checked})} /> Ativar GTM</label>
        <input className="w-full border rounded p-2" placeholder="GTM-XXXXXXX" value={settings.gtmContainerId||''} onChange={e=>setSettings({...settings, gtmContainerId:e.target.value})} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.googleAdsEnabled} onChange={e=>setSettings({...settings, googleAdsEnabled:e.target.checked})} /> Ativar Google Ads</label>
        <input className="w-full border rounded p-2" placeholder="AW-123456789" value={settings.googleAdsId||''} onChange={e=>setSettings({...settings, googleAdsId:e.target.value})} />
        <input className="w-full border rounded p-2" placeholder="Conversion Label padrão" value={settings.googleAdsLabel||''} onChange={e=>setSettings({...settings, googleAdsLabel:e.target.value})} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.ga4Enabled} onChange={e=>setSettings({...settings, ga4Enabled:e.target.checked})} /> Ativar GA4</label>
        <input className="w-full border rounded p-2" placeholder="G-XXXXXXXXXX" value={settings.ga4MeasurementId||''} onChange={e=>setSettings({...settings, ga4MeasurementId:e.target.value})} />
        <input className="w-full border rounded p-2" type="password" placeholder={settings.ga4ApiSecretMasked || 'GA4 API Secret'} value={settings.ga4ApiSecret||''} onChange={e=>setSettings({...settings, ga4ApiSecret:e.target.value})} />
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-60" onClick={saveSettings} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>

    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div><h2 className="font-semibold text-lg">Eventos do funil</h2><p className="text-sm text-muted-foreground">Cada vez que um lead entrar no formulário ou avançar para uma etapa configurada, o FlipForm enviará um evento para os pixels conectados.</p></div>
      <div className="grid gap-2 md:grid-cols-4">
        <select className="border rounded p-2" value={form.pipelineId||''} onChange={e=>{ const p = pipelines.find(x=>x.id===e.target.value); setForm({...form, pipelineId:e.target.value, stageId:p?.stages?.[0]?.id || ''}); }}><option value="">Pipeline</option>{pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="border rounded p-2" value={form.stageId||''} onChange={e=>setForm({...form, stageId:e.target.value})}><option value="">Etapa</option>{(selectedPipeline?.stages||[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="border rounded p-2" value={form.provider} onChange={e=>setForm({...form, provider:e.target.value})}>{providers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select>
        <select className="border rounded p-2" value={form.eventName} onChange={e=>setForm({...form, eventName:e.target.value})}>{eventNames.map(e=><option key={e} value={e}>{e === 'CustomEvent' ? 'Evento personalizado' : e}</option>)}</select>
        {form.eventName === 'CustomEvent' && <input className="border rounded p-2" placeholder="Nome personalizado" value={form.customEventName||''} onChange={e=>setForm({...form, customEventName:e.target.value})} />}
        <input className="border rounded p-2" placeholder="Label Google / nome externo" value={form.conversionLabel||''} onChange={e=>setForm({...form, conversionLabel:e.target.value})} />
        <input className="border rounded p-2" type="number" step="0.01" placeholder="Valor opcional" value={form.conversionValue||''} onChange={e=>setForm({...form, conversionValue:e.target.value})} />
        <label className="flex items-center gap-2 text-sm border rounded p-2"><input type="checkbox" checked={!!form.enabled} onChange={e=>setForm({...form, enabled:e.target.checked})} /> Ativo</label>
      </div>
      <button className="px-4 py-2 rounded bg-black text-white" onClick={addEvent}>Adicionar evento</button>
      <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">Pipeline</th><th className="p-2 text-left">Etapa</th><th className="p-2 text-left">Provedor</th><th className="p-2 text-left">Evento</th><th className="p-2 text-left">Label/Valor</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Ações</th></tr></thead><tbody>{events.map(ev=>{ const p=pipelines.find(x=>x.id===ev.pipelineId); const st=p?.stages?.find((s:any)=>s.id===ev.stageId); return <tr key={ev.id} className="border-t"><td className="p-2">{p?.name || ev.pipelineId}</td><td className="p-2">{st?.name || ev.stageId}</td><td className="p-2">{providers.find(p=>p.value===ev.provider)?.label || ev.provider}</td><td className="p-2">{ev.customEventName || ev.eventName}</td><td className="p-2">{ev.conversionLabel || '-'} {ev.conversionValue ? `· R$ ${ev.conversionValue}` : ''}</td><td className="p-2">{ev.enabled ? 'Ativo' : 'Inativo'}</td><td className="p-2 space-x-2"><button className="underline" onClick={()=>toggleEvent(ev)}>{ev.enabled ? 'Desativar' : 'Ativar'}</button><button className="underline text-red-600" onClick={()=>deleteEvent(ev.id)}>Excluir</button></td></tr>})}{events.length===0 && <tr><td className="p-4 text-muted-foreground" colSpan={7}>Nenhum evento configurado.</td></tr>}</tbody></table></div>
    </div>


    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div className="space-y-2">
        <h2 className="font-semibold text-lg">Funil WhatsApp</h2>
        <p className="text-sm text-muted-foreground">Monte um funil de frases-gatilho para o WhatsApp. Cada frase enviada pelo vendedor pode disparar um evento diferente na Meta, ajudando suas campanhas a entenderem quais conversas viraram leads, oportunidades, pedidos ou compras.</p>
        <p className="text-sm text-muted-foreground">Use frases padronizadas com sua equipe comercial. Exemplo: quando o vendedor enviar ‘✅ Pedido realizado’, o FlipForm dispara o evento Purchase para o Pixel configurado.</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Essa função só dispara eventos quando a mensagem for enviada pelo vendedor e corresponder a uma frase ativa do funil.</div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">O Funil WhatsApp usa o mesmo Pixel configurado em Meta Ads. Use um único Pixel para consolidar os eventos do seu funil. O FlipForm diferencia a origem dos eventos automaticamente.</div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.whatsappFunnelEnabled} onChange={e=>setSettings({...settings, whatsappFunnelEnabled:e.target.checked})} /> Ativar Funil WhatsApp</label>
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-60" onClick={saveSettings} disabled={saving}>{saving ? 'Salvando...' : 'Salvar ativação'}</button>

      <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Frases do funil</h3>
        <p className="text-sm text-muted-foreground">Configure eventos por WhatsApp separados das etapas obrigatórias do Kanban.</p>
        <div className="flex flex-wrap gap-2">{whatsappSuggestions.map((suggestion)=><button key={suggestion.triggerPhrase} className="rounded-full border px-3 py-1 text-xs" onClick={()=>setWhatsappForm({...whatsappForm, ...suggestion, matchType:'exact', currency:'BRL', oncePerLead:true, enabled:true})}>Usar modelo: {suggestion.triggerPhrase}</button>)}</div>
        <div className="grid gap-2 md:grid-cols-4">
          <input className="border rounded p-2" placeholder="Nome da etapa do funil" value={whatsappForm.name||''} onChange={e=>setWhatsappForm({...whatsappForm, name:e.target.value})} />
          <input className="border rounded p-2" placeholder="Frase-gatilho enviada pelo vendedor" value={whatsappForm.triggerPhrase||''} onChange={e=>setWhatsappForm({...whatsappForm, triggerPhrase:e.target.value})} />
          <select className="border rounded p-2" value={whatsappForm.matchType} onChange={e=>setWhatsappForm({...whatsappForm, matchType:e.target.value})}>{matchTypes.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select>
          <select className="border rounded p-2" value={whatsappForm.eventName} onChange={e=>setWhatsappForm({...whatsappForm, eventName:e.target.value})}>{eventNames.map(e=><option key={e} value={e}>{e === 'CustomEvent' ? 'Evento personalizado' : e}</option>)}</select>
          {whatsappForm.eventName === 'CustomEvent' && <input className="border rounded p-2" placeholder="Nome personalizado" value={whatsappForm.customEventName||''} onChange={e=>setWhatsappForm({...whatsappForm, customEventName:e.target.value})} />}
          <input className="border rounded p-2" type="number" min="0" placeholder="Ordem" value={whatsappForm.orderIndex||''} onChange={e=>setWhatsappForm({...whatsappForm, orderIndex:e.target.value})} />
          <input className="border rounded p-2" type="number" step="0.01" placeholder="Valor opcional" value={whatsappForm.conversionValue||''} onChange={e=>setWhatsappForm({...whatsappForm, conversionValue:e.target.value})} />
          <input className="border rounded p-2" placeholder="Moeda" value={whatsappForm.currency||'BRL'} onChange={e=>setWhatsappForm({...whatsappForm, currency:e.target.value.toUpperCase()})} />
          <label className="flex items-center gap-2 text-sm border rounded p-2"><input type="checkbox" checked={!!whatsappForm.oncePerLead} onChange={e=>setWhatsappForm({...whatsappForm, oncePerLead:e.target.checked})} /> Disparar apenas uma vez por lead/conversa</label>
          <label className="flex items-center gap-2 text-sm border rounded p-2"><input type="checkbox" checked={!!whatsappForm.enabled} onChange={e=>setWhatsappForm({...whatsappForm, enabled:e.target.checked})} /> Ativo</label>
        </div>
        {whatsappForm.matchType === 'contains' && <p className="text-xs text-amber-700">A correspondência “contém” pode gerar disparos incorretos se a frase for muito genérica.</p>}
        <div className="flex flex-wrap gap-2"><button className="px-4 py-2 rounded bg-black text-white" onClick={addWhatsappTrigger}>{whatsappForm.id ? 'Salvar frase-gatilho' : 'Adicionar frase-gatilho'}</button><input className="border rounded p-2" value={whatsappTestText} onChange={e=>setWhatsappTestText(e.target.value)} placeholder="Texto para testar" /><button className="px-4 py-2 rounded border" onClick={testWhatsappTrigger}>Testar gatilho</button></div>
        <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">Ordem</th><th className="p-2 text-left">Nome da etapa do funil</th><th className="p-2 text-left">Frase-gatilho</th><th className="p-2 text-left">Evento Meta correspondente</th><th className="p-2 text-left">Tipo de correspondência</th><th className="p-2 text-left">Valor</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Último disparo</th><th className="p-2 text-left">Ações</th></tr></thead><tbody>{whatsappTriggers.map(trigger=><tr key={trigger.id} className="border-t"><td className="p-2">{trigger.orderIndex}</td><td className="p-2">{trigger.name}</td><td className="p-2">{trigger.triggerPhrase}</td><td className="p-2">Meta {trigger.customEventName || trigger.eventName}</td><td className="p-2">{matchTypes.find(m=>m.value===trigger.matchType)?.label || trigger.matchType}</td><td className="p-2">{trigger.conversionValue === null || trigger.conversionValue === undefined ? '-' : `R$ ${Number(trigger.conversionValue).toFixed(2)}`}</td><td className="p-2">{trigger.enabled ? 'Ativo' : 'Inativo'}</td><td className="p-2">{trigger.lastTriggeredAt ? new Date(trigger.lastTriggeredAt).toLocaleString('pt-BR') : '-'}</td><td className="p-2 space-x-2"><button className="underline" onClick={()=>setWhatsappForm({...trigger})}>Editar</button><button className="underline" onClick={()=>toggleWhatsappTrigger(trigger)}>{trigger.enabled ? 'Desativar' : 'Ativar'}</button><button className="underline text-red-600" onClick={()=>deleteWhatsappTrigger(trigger.id)}>Excluir</button></td></tr>)}{whatsappTriggers.length===0 && <tr><td className="p-4 text-muted-foreground" colSpan={9}>Nenhuma frase do Funil WhatsApp configurada.</td></tr>}</tbody></table></div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-blue-50 p-5 text-sm text-blue-950"><h2 className="font-semibold mb-2">Como usar</h2><p>Para melhores resultados, configure um evento Purchase na etapa final do seu funil. Use eventos intermediários para treinar suas campanhas com sinais mais qualificados. Eventos falhos não impedem o funcionamento do CRM.</p></div>
      <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold mb-2">Últimos logs</h2><div className="space-y-2 text-sm">{logs.slice(0,6).map(log=><div key={log.id} className="flex justify-between border-b pb-1"><span>{log.provider} · {log.eventName}</span><span className="text-muted-foreground">{log.status}</span></div>)}{logs.length===0 && <p className="text-muted-foreground">Nenhum evento registrado ainda.</p>}</div></div>
    </div>
  </div>;
}
