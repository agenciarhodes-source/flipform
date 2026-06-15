'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

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

const emptyForm = { name: '', orderIndex: 0, triggerPhrase: '', matchType: 'exact', eventName: 'Lead', currency: 'BRL', oncePerLead: true, enabled: true };

export function WhatsAppFunnelClient() {
  const [settings, setSettings] = useState<any>({ whatsappFunnelEnabled: false });
  const [triggers, setTriggers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [testText, setTestText] = useState('✅ Lead qualificado');
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const pixelConfigured = Boolean(settings?.metaPixelId);
  const tokenConfigured = Boolean(settings?.metaAccessTokenMasked);
  const whatsappLogs = useMemo(() => logs.filter((log) => ['whatsapp_funnel', 'whatsapp_trigger', 'seller_phrase'].includes(log.source) || log.triggerRuleId), [logs]);

  async function load() {
    setLoading(true);
    setSettingsFailed(false);
    try {
      const [settingsRes, triggersRes, logsRes] = await Promise.allSettled([
        fetch('/api/integrations').then((r) => r.json()),
        fetch('/api/integrations/whatsapp-funnel').then((r) => r.json()),
        fetch('/api/integrations/event-logs').then((r) => r.json()),
      ]);
      if (settingsRes.status === 'fulfilled' && settingsRes.value.settings) setSettings({ ...settingsRes.value.settings, metaAccessToken: '', ga4ApiSecret: '' });
      else setSettingsFailed(true);
      if (triggersRes.status === 'fulfilled') setTriggers(triggersRes.value.triggers || []);
      if (logsRes.status === 'fulfilled') setLogs(logsRes.value.logs || []);
    } catch {
      toast.error('Não foi possível carregar o Funil WhatsApp.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function saveActivation() {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar ativação.');
      setSettings({ ...data.settings, metaAccessToken: '', ga4ApiSecret: '' });
      toast.success('Ativação do Funil WhatsApp salva.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar ativação.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTrigger() {
    try {
      const editingId = form.id;
      const res = await fetch(editingId ? `/api/integrations/whatsapp-funnel/${editingId}` : '/api/integrations/whatsapp-funnel', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, orderIndex: Number(form.orderIndex || triggers.length + 1) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar frase-gatilho.');
      toast.success(editingId ? 'Frase-gatilho atualizada.' : 'Frase-gatilho criada.');
      setForm({ ...emptyForm, orderIndex: triggers.length + 2 });
      await load();
    } catch (error: any) { toast.error(error.message || 'Erro ao salvar frase-gatilho.'); }
  }

  async function toggleTrigger(trigger: any) {
    const res = await fetch(`/api/integrations/whatsapp-funnel/${trigger.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...trigger, enabled: !trigger.enabled }) });
    if (!res.ok) toast.error('Não foi possível atualizar a frase-gatilho.');
    await load();
  }

  async function deleteTrigger(id: string) {
    if (!confirm('Excluir esta frase-gatilho do Funil WhatsApp?')) return;
    const res = await fetch(`/api/integrations/whatsapp-funnel/${id}`, { method: 'DELETE' });
    if (!res.ok) toast.error('Não foi possível excluir a frase-gatilho.'); else toast.success('Frase-gatilho excluída.');
    await load();
  }

  async function testTrigger() {
    const res = await fetch('/api/integrations/whatsapp-funnel/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: testText, dryRun: true }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'Falha ao testar gatilho.');
    setTestResult(data.matched || null);
    if (data.matched) toast.success(`Gatilho encontrado: ${data.matched.name} → ${data.matched.eventName}`); else toast.info('Nenhuma frase ativa corresponde ao texto testado.');
  }

  return <div className="p-6 space-y-6 max-w-7xl">
    <div className="space-y-2">
      <h1 className="text-3xl font-bold">Funil WhatsApp</h1>
      <p className="text-sm text-muted-foreground">Monte um funil de frases-gatilho para disparar eventos na Meta a partir das mensagens enviadas pelo vendedor.</p>
    </div>

    {loading && <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Carregando Funil WhatsApp...</div>}

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border bg-white p-5 space-y-3 shadow-sm lg:col-span-2">
        <h2 className="font-semibold text-lg">Como funciona</h2>
        <p className="text-sm text-muted-foreground">Cada frase enviada pelo vendedor pode acionar um evento diferente na Meta. Exemplo: quando o vendedor envia ‘✅ Pedido realizado’, o FlipForm dispara o evento Purchase para o Pixel configurado.</p>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">O Funil WhatsApp usa o mesmo Pixel configurado em Integrações &gt; Meta Ads.</div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Essa função só dispara eventos quando a mensagem for enviada pelo vendedor e corresponder a uma frase ativa do funil.</div>
      </div>
      <div className="rounded-xl border bg-white p-5 space-y-3 shadow-sm">
        <h2 className="font-semibold text-lg">Status da Meta</h2>
        {settingsFailed ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Não foi possível verificar Pixel/Token agora. Você ainda pode montar o Funil WhatsApp. <button className="underline" onClick={load}>Tentar novamente</button></div> : <>
          <p className="text-sm">Pixel configurado: <strong>{pixelConfigured ? 'sim' : 'não'}</strong></p>
          <p className="text-sm">Token da API configurado: <strong>{tokenConfigured ? 'sim' : 'não'}</strong></p>
          {(!pixelConfigured || !tokenConfigured) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Configure o Pixel e o Token da Meta em Integrações para enviar eventos. Você ainda pode montar o Funil WhatsApp agora.</div>}
        </>}
        <Link className="inline-flex px-4 py-2 rounded border text-sm hover:bg-muted" href="/integrations">Ir para Integrações</Link>
      </div>
    </div>

    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <h2 className="font-semibold text-lg">Ativação</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.whatsappFunnelEnabled} onChange={e=>setSettings({...settings, whatsappFunnelEnabled:e.target.checked})} /> Ativar Funil WhatsApp</label>
      <p className="text-sm text-muted-foreground">Se desativado, as regras ficam salvas, mas nenhuma frase dispara evento.</p>
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-60" onClick={saveActivation} disabled={saving}>{saving ? 'Salvando...' : 'Salvar ativação'}</button>
    </div>

    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div><h2 className="font-semibold text-lg">Frases do funil</h2><p className="text-sm text-muted-foreground">Crie e gerencie frases padronizadas para sua equipe comercial.</p></div>
      {triggers.length === 0 && <div className="rounded-lg border border-dashed p-5 space-y-3"><h3 className="font-semibold">Você ainda não criou nenhuma frase do Funil WhatsApp.</h3><p className="text-sm text-muted-foreground">Crie frases padronizadas para sua equipe comercial. Quando o vendedor enviar a frase no WhatsApp, o FlipForm dispara o evento correspondente para a Meta.</p><button className="px-4 py-2 rounded bg-black text-white" onClick={()=>setForm({ ...emptyForm, ...whatsappSuggestions[0] })}>Adicionar primeira frase</button><div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{whatsappSuggestions.map(s=><span key={s.triggerPhrase} className="rounded-full border px-3 py-1">{s.triggerPhrase} → {s.eventName}</span>)}</div></div>}
      <div className="flex flex-wrap gap-2">{whatsappSuggestions.map((suggestion)=><button key={suggestion.triggerPhrase} className="rounded-full border px-3 py-1 text-xs" onClick={()=>setForm({...form, ...suggestion, matchType:'exact', currency:'BRL', oncePerLead:true, enabled:true})}>Usar modelo: {suggestion.triggerPhrase}</button>)}</div>
      <div className="grid gap-2 md:grid-cols-4">
        <input className="border rounded p-2" placeholder="Nome da etapa do funil" value={form.name||''} onChange={e=>setForm({...form, name:e.target.value})} />
        <input className="border rounded p-2" placeholder="Frase-gatilho enviada pelo vendedor" value={form.triggerPhrase||''} onChange={e=>setForm({...form, triggerPhrase:e.target.value})} />
        <select className="border rounded p-2" value={form.matchType} onChange={e=>setForm({...form, matchType:e.target.value})}>{matchTypes.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select>
        <select className="border rounded p-2" value={form.eventName} onChange={e=>setForm({...form, eventName:e.target.value})}>{eventNames.map(e=><option key={e} value={e}>{e === 'CustomEvent' ? 'Evento personalizado' : e}</option>)}</select>
        {form.eventName === 'CustomEvent' && <input className="border rounded p-2" placeholder="Nome personalizado" value={form.customEventName||''} onChange={e=>setForm({...form, customEventName:e.target.value})} />}
        <input className="border rounded p-2" type="number" min="0" placeholder="Ordem" value={form.orderIndex||''} onChange={e=>setForm({...form, orderIndex:e.target.value})} />
        <input className="border rounded p-2" type="number" step="0.01" placeholder="Valor opcional" value={form.conversionValue||''} onChange={e=>setForm({...form, conversionValue:e.target.value})} />
        <input className="border rounded p-2" placeholder="Moeda" value={form.currency||'BRL'} onChange={e=>setForm({...form, currency:e.target.value.toUpperCase()})} />
        <label className="flex items-center gap-2 text-sm border rounded p-2"><input type="checkbox" checked={!!form.oncePerLead} onChange={e=>setForm({...form, oncePerLead:e.target.checked})} /> Disparar apenas uma vez por lead/conversa</label>
        <label className="flex items-center gap-2 text-sm border rounded p-2"><input type="checkbox" checked={!!form.enabled} onChange={e=>setForm({...form, enabled:e.target.checked})} /> Ativo</label>
        <select className="border rounded p-2" disabled><option>Opcional: mover lead para etapa do Kanban</option></select>
      </div>
      {form.matchType === 'contains' && <p className="text-xs text-amber-700">A correspondência “contém” pode gerar disparos incorretos se a frase for muito genérica.</p>}
      <button className="px-4 py-2 rounded bg-black text-white" onClick={saveTrigger}>{form.id ? 'Salvar frase-gatilho' : 'Adicionar frase-gatilho'}</button>
      <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">Ordem</th><th className="p-2 text-left">Nome da etapa do funil</th><th className="p-2 text-left">Frase-gatilho</th><th className="p-2 text-left">Evento correspondente na Meta</th><th className="p-2 text-left">Tipo de correspondência</th><th className="p-2 text-left">Valor</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Último disparo</th><th className="p-2 text-left">Ações</th></tr></thead><tbody>{triggers.map(trigger=><tr key={trigger.id} className="border-t"><td className="p-2">{trigger.orderIndex}</td><td className="p-2">{trigger.name}</td><td className="p-2">{trigger.triggerPhrase}</td><td className="p-2">Meta {trigger.customEventName || trigger.eventName}</td><td className="p-2">{matchTypes.find(m=>m.value===trigger.matchType)?.label || trigger.matchType}</td><td className="p-2">{trigger.conversionValue === null || trigger.conversionValue === undefined ? '-' : `R$ ${Number(trigger.conversionValue).toFixed(2)}`}</td><td className="p-2">{trigger.enabled ? 'Ativo' : 'Inativo'}</td><td className="p-2">{trigger.lastTriggeredAt ? new Date(trigger.lastTriggeredAt).toLocaleString('pt-BR') : '-'}</td><td className="p-2 space-x-2"><button className="underline" onClick={()=>setForm({...trigger})}>Editar</button><button className="underline" onClick={()=>toggleTrigger(trigger)}>{trigger.enabled ? 'Desativar' : 'Ativar'}</button><button className="underline text-red-600" onClick={()=>deleteTrigger(trigger.id)}>Excluir</button></td></tr>)}</tbody></table></div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-5 space-y-3 shadow-sm"><h2 className="font-semibold text-lg">Testar frase-gatilho</h2><input className="w-full border rounded p-2" value={testText} onChange={e=>setTestText(e.target.value)} placeholder="Texto de teste" /><button className="px-4 py-2 rounded border" onClick={testTrigger}>Testar gatilho</button>{testResult ? <p className="text-sm text-green-700">Encontrou regra: {testResult.name} → {testResult.eventName}. Nenhum evento real foi disparado.</p> : <p className="text-sm text-muted-foreground">O teste é dry run e não dispara evento real.</p>}</div>
      <div className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold text-lg mb-3">Logs do Funil WhatsApp</h2><div className="space-y-2 text-sm">{whatsappLogs.slice(0,8).map(log=><div key={log.id} className="flex justify-between gap-3 border-b pb-1"><span>{new Date(log.createdAt).toLocaleString('pt-BR')} · {log.triggerRuleId || 'regra'} · {log.eventName}</span><span className="text-muted-foreground">{log.status}{log.reason ? ` · ${log.reason}` : ''}</span></div>)}{whatsappLogs.length===0 && <p className="text-muted-foreground">Nenhum log específico do Funil WhatsApp registrado ainda.</p>}</div></div>
    </div>
  </div>;
}
