'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, GripVertical, Plus, Eye, Save, ChevronRight, ArrowLeft, Workflow, AlertTriangle } from 'lucide-react';
import { PublicFormPreview } from './public-form-preview';
import { FORM_LEAD_SOURCES } from '@/lib/leads';
import { cleanOptionObjects, cleanOptions, defaultSelectionModeFor, isQualifier, normalizeOptionObjects, normalizeOptions, normalizeQualificationMode, normalizeSelectionMode, validateChoiceOptions } from '@/lib/form-field-validation';

const FIELD_TYPES = [
  { v: 'short_text', l: 'Texto curto' },
  { v: 'long_text', l: 'Texto longo' },
  { v: 'name', l: 'Nome' },
  { v: 'email', l: 'E-mail' },
  { v: 'phone_br', l: 'Telefone Brasil' },
  { v: 'number', l: 'Número' },
  { v: 'date', l: 'Data' },
  { v: 'cpf', l: 'CPF' },
  { v: 'cnpj', l: 'CNPJ' },
  { v: 'single_select', l: 'Seleção única' },
  { v: 'multi_select', l: 'Múltipla escolha' },
  { v: 'dropdown', l: 'Lista suspensa' },
  { v: 'rating', l: 'Escala 1-10' },
  { v: 'url', l: 'URL' },
  { v: 'city_state', l: 'Cidade/Estado' },
];

interface Field {
  id?: string;
  label: string;
  placeholder?: string | null;
  description?: string | null;
  fieldType: string;
  options?: any[] | null;
  validationRules?: { selectionMode?: 'single' | 'multiple'; isQualifier?: boolean; qualificationMode?: 'any' | 'all'; [key: string]: unknown } | null;
  isRequired: boolean;
  orderIndex: number;
}

export function FormBuilder({ formId }: { formId?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [bgColor, setBgColor] = useState('');
  const [buttonColor, setButtonColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [successMessage, setSuccessMessage] = useState('Obrigado pelo envio!');
  const [dqTitle, setDqTitle] = useState('Obrigado pelo interesse');
  const [dqMessage, setDqMessage] = useState('No momento, seu perfil não atende aos critérios necessários para continuar este cadastro.');
  const [dqButtonText, setDqButtonText] = useState('Entendi');
  const [dqRedirectUrl, setDqRedirectUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [leadSource, setLeadSource] = useState('formulario');
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rotation, setRotation] = useState<any>(null);
  const [savingRotation, setSavingRotation] = useState(false);
  const optionInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Pipelines / Stages
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [initialStageId, setInitialStageId] = useState<string>('');
  const [pipelinesLoaded, setPipelinesLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/pipelines?includeArchived=1').then((r) => r.json()).then((d) => {
      setPipelines(d.pipelines || []);
      setPipelinesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (formId) fetch(`/api/forms/${formId}/assignment-rotation`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setRotation(d); }).catch(() => null);
    if (!formId) {
      setName('Formulário sem título');
      setPublicTitle('Como podemos ajudar?');
      setLeadSource('formulario');
      setFields([
        { label: 'Qual seu nome?', fieldType: 'name', isRequired: true, orderIndex: 0, placeholder: 'Seu nome' },
        { label: 'E-mail', fieldType: 'email', isRequired: true, orderIndex: 1, placeholder: 'nome@email.com' },
      ]);
      return;
    }
    fetch(`/api/forms/${formId}`).then((r) => r.json()).then((d) => {
      const f = d.form;
      setName(f.name);
      setPublicTitle(f.publicTitle);
      setPublicDescription(f.publicDescription || '');
      setPrimaryColor(f.primaryColor);
      setBgColor(f.bgColor || '');
      setButtonColor(f.buttonColor || '');
      setTextColor(f.textColor || '');
      setTheme((f.theme as any) || 'light');
      setCoverImageUrl(f.coverImageUrl || '');
      setFormLogoUrl(f.logoUrl || '');
      setSuccessMessage(f.successMessage);
      setDqTitle(f.disqualificationSettings?.title || 'Obrigado pelo interesse');
      setDqMessage(f.disqualificationSettings?.message || 'No momento, seu perfil não atende aos critérios necessários para continuar este cadastro.');
      setDqButtonText(f.disqualificationSettings?.buttonText || 'Entendi');
      setDqRedirectUrl(f.disqualificationSettings?.redirectUrl || '');
      setIsActive(f.isActive);
      setLeadSource(f.leadSource || 'formulario');
      setPipelineId(f.pipelineId || '');
      setInitialStageId(f.initialStageId || '');
      setFields(f.fields.map((ff: any) => ({
        id: ff.id, label: ff.label, placeholder: ff.placeholder, description: ff.description,
        fieldType: ff.fieldType, options: normalizeOptionObjects(ff.options), validationRules: ff.validationRules, isRequired: ff.isRequired, orderIndex: ff.orderIndex,
      })));
    });
  }, [formId]);

  // Auto-selecionar default ao criar novo form
  useEffect(() => {
    if (!formId && pipelinesLoaded && !pipelineId && pipelines.length) {
      const def = pipelines.find((p) => p.isDefault && !p.isArchived) || pipelines.find((p) => !p.isArchived);
      if (def) {
        setPipelineId(def.id);
        const firstStage = def.stages.find((s: any) => !s.isArchived);
        if (firstStage) setInitialStageId(firstStage.id);
      }
    }
  /* eslint-disable-next-line */ }, [pipelinesLoaded, pipelines, formId]);


  const toggleRotationMember = (userId: string, checked: boolean) => {
    setRotation((current: any) => {
      const members = current?.members || [];
      const exists = members.find((m: any) => m.userId === userId);
      const nextMembers = exists
        ? members.map((m: any) => m.userId === userId ? { ...m, isActive: checked } : m)
        : [...members, { userId, orderIndex: members.length, isActive: checked }];
      return { ...(current || {}), members: nextMembers.map((m: any, index: number) => ({ ...m, orderIndex: index })) };
    });
  };

  const moveRotationMember = (userId: string, direction: -1 | 1) => {
    setRotation((current: any) => {
      const members = [...(current?.members || [])].sort((a, b) => a.orderIndex - b.orderIndex);
      const index = members.findIndex((m: any) => m.userId === userId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= members.length) return current;
      [members[index], members[target]] = [members[target], members[index]];
      return { ...current, members: members.map((m: any, orderIndex: number) => ({ ...m, orderIndex })) };
    });
  };

  const saveRotation = async () => {
    if (!formId || !rotation) return;
    setSavingRotation(true);
    const members = (rotation.members || []).filter((m: any) => m.isActive).map((m: any, index: number) => ({ userId: m.userId, orderIndex: index, isActive: true }));
    const res = await fetch(`/api/forms/${formId}/assignment-rotation`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isEnabled: !!rotation.isEnabled, strategy: 'round_robin', members }) });
    setSavingRotation(false);
    if (!res.ok) return toast.error((await res.json()).error || 'Não foi possível salvar a distribuição.');
    toast.success('Distribuição de leads salva.');
    fetch(`/api/forms/${formId}/assignment-rotation`).then((r) => r.json()).then(setRotation);
  };

  const currentPipeline = pipelines.find((p) => p.id === pipelineId);
  const availableStages = (currentPipeline?.stages || []).filter((s: any) => !s.isArchived);
  const currentStage = currentPipeline?.stages.find((s: any) => s.id === initialStageId);
  const pipelineArchived = currentPipeline?.isArchived;
  const stageArchived = currentStage?.isArchived;
  const noActivePipelines = pipelinesLoaded && pipelines.filter((p) => !p.isArchived).length === 0;

  const addField = () => {
    setFields([...fields, { label: 'Nova pergunta', fieldType: 'short_text', isRequired: false, orderIndex: fields.length }]);
    setSelectedIdx(fields.length);
  };

  const defaultPlaceholderFor = (fieldType: string) => ({
    phone_br: '+55 (00) 9 0000-0000',
    phone: '+55 (00) 9 0000-0000',
    cpf: '000.000.000-00',
    cnpj: '00.000.000/0000-00',
    email: 'nome@email.com',
  } as Record<string, string>)[fieldType] || '';

  const updateField = (idx: number, patch: Partial<Field>) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };


  const ensureChoiceDefaults = (fieldType: string, field: Field): Partial<Field> => {
    if (!['single_select', 'multi_select', 'dropdown'].includes(fieldType)) return {};
    const normalized = normalizeOptionObjects(field.options);
    return {
      options: normalized.length ? normalized : [{ id: 'opt_1', label: '', qualifies: false }, { id: 'opt_2', label: '', qualifies: false }],
      validationRules: { ...(field.validationRules || {}), selectionMode: defaultSelectionModeFor(fieldType) },
    };
  };

  const updateOption = (idx: number, optionIdx: number, value: string) => {
    const options = normalizeOptionObjects(fields[idx].options);
    options[optionIdx] = { ...options[optionIdx], label: value };
    updateField(idx, { options });
  };

  const addOption = (idx: number) => {
    const options = [...normalizeOptionObjects(fields[idx].options), { id: `opt_${Date.now()}`, label: '', qualifies: false }];
    updateField(idx, { options });
    setTimeout(() => optionInputRefs.current[`${idx}-${options.length - 1}`]?.focus(), 0);
  };

  const removeOption = (idx: number, optionIdx: number) => {
    const options = normalizeOptionObjects(fields[idx].options);
    if (options.length <= 2) {
      toast.error('Adicione pelo menos duas opções.');
      return;
    }
    updateField(idx, { options: options.filter((_, i) => i !== optionIdx) });
  };

  const moveOption = (idx: number, optionIdx: number, dir: -1 | 1) => {
    const nextIdx = optionIdx + dir;
    const options = normalizeOptionObjects(fields[idx].options);
    if (nextIdx < 0 || nextIdx >= options.length) return;
    [options[optionIdx], options[nextIdx]] = [options[nextIdx], options[optionIdx]];
    updateField(idx, { options });
  };

  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const next = [...fields];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setFields(next.map((f, i) => ({ ...f, orderIndex: i })));
    setSelectedIdx(newIdx);
  };

  const save = async () => {
    if (!pipelineId || !initialStageId) {
      toast.error('Selecione pipeline e etapa inicial.');
      return;
    }
    if (pipelineArchived || stageArchived) {
      toast.error('Pipeline ou etapa estão arquivados. Escolha ativos antes de salvar.');
      return;
    }
    for (const field of fields) {
      if (['single_select', 'multi_select', 'dropdown'].includes(field.fieldType)) {
        const validation = validateChoiceOptions(field.options, field.validationRules);
        if (!validation.ok) {
          toast.error(validation.error);
          setSelectedIdx(fields.indexOf(field));
          return;
        }
      }
    }
    setSaving(true);
    try {
      const payload = {
        name, publicTitle, publicDescription, primaryColor,
        bgColor: bgColor || null,
        buttonColor: buttonColor || null,
        textColor: textColor || null,
        theme,
        coverImageUrl: coverImageUrl || null,
        logoUrl: formLogoUrl || null,
        successMessage, leadSource, disqualificationSettings: { title: dqTitle, message: dqMessage, buttonText: dqButtonText, redirectUrl: dqRedirectUrl || null }, isActive, fields: fields.map((field) => ({ ...field, options: cleanOptionObjects(field.options) })), pipelineId, initialStageId,
      };
      const res = await fetch(formId ? `/api/forms/${formId}` : '/api/forms', {
        method: formId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(formId ? 'Formulário salvo!' : 'Formulário criado!');
      if (!formId && data.form) router.push(`/forms/${data.form.id}/edit`);
      else router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const selected = selectedIdx !== null ? fields[selectedIdx] : null;
  const needsOptions = selected && ['single_select', 'multi_select', 'dropdown'].includes(selected.fieldType);

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b bg-card px-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/forms"><Button size="sm" variant="ghost"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-64 font-medium" placeholder="Nome interno" />
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-muted-foreground">{isActive ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)}><Eye className="w-4 h-4 mr-2" />Preview</Button>
          <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista de campos */}
        <div className="w-72 border-r bg-card overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Perguntas</div>
            <Button size="sm" variant="ghost" onClick={addField}><Plus className="w-3.5 h-3.5" /></Button>
          </div>
          {fields.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left p-2 mb-1 rounded-md border ${selectedIdx === i ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-muted'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{FIELD_TYPES.find(t => t.v === f.fieldType)?.l || (f.fieldType === 'document' ? 'CPF/CNPJ (legado)' : f.fieldType)}</div>
                </div>
                {f.isRequired && <Badge variant="secondary" className="text-[10px] h-4 px-1">*</Badge>}
              </div>
            </button>
          ))}
          <Button variant="outline" className="w-full mt-2" size="sm" onClick={addField}><Plus className="w-3 h-3 mr-1" />Adicionar campo</Button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto bg-muted/30">
          <div className="max-w-2xl mx-auto p-6 space-y-6">

            {formId && rotation && (
              <Card className="p-5">
                <h3 className="font-heading font-semibold mb-1 flex items-center gap-2"><Workflow className="w-4 h-4 text-brand-600" />Distribuição de leads</h3>
                <p className="text-xs text-muted-foreground mb-4">Configure rodízio automático entre Atendentes/Vendedores ativos. Apenas usuários com perfil Atendente/Vendedor podem receber leads.</p>
                <div className="space-y-3">
                  <Label>Modo de distribuição</Label>
                  <Select value={rotation.isEnabled ? 'round_robin' : 'none'} onValueChange={(v) => setRotation((current: any) => ({ ...current, isEnabled: v === 'round_robin' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem distribuição automática</SelectItem><SelectItem value="round_robin">Rodízio entre vendedores</SelectItem></SelectContent>
                  </Select>
                  {rotation.isEnabled && <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium">Ordem do rodízio</div>
                    {rotation.availableAgents?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum Atendente/Vendedor ativo disponível.</p>}
                    {rotation.availableAgents?.map((agent: any) => {
                      const member = rotation.members?.find((m: any) => m.userId === agent.userId);
                      return <div key={agent.userId} className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-sm"><input type="checkbox" checked={!!member?.isActive} onChange={(e) => toggleRotationMember(agent.userId, e.target.checked)} /><span className="flex-1">{agent.name} <span className="text-xs text-muted-foreground">{agent.email}</span></span><Button type="button" size="sm" variant="outline" onClick={() => moveRotationMember(agent.userId, -1)}>↑</Button><Button type="button" size="sm" variant="outline" onClick={() => moveRotationMember(agent.userId, 1)}>↓</Button></div>;
                    })}
                  </div>}
                  <Button type="button" onClick={saveRotation} disabled={savingRotation}>{savingRotation ? 'Salvando...' : 'Salvar distribuição'}</Button>
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Origem automática do lead</h3>
              <p className="text-xs text-muted-foreground mb-4">Todos os clientes que enviarem este formulário serão identificados automaticamente com esta origem.</p>
              <div className="space-y-2">
                <Label>Origem dos clientes</Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent>
                    {FORM_LEAD_SOURCES.map((source) => <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Use este link no canal selecionado. Os novos leads entrarão no CRM com essa origem.</p>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1 flex items-center gap-2"><Workflow className="w-4 h-4 text-brand-600" />Destino do lead</h3>
              <p className="text-xs text-muted-foreground mb-4">Para qual pipeline e etapa este lead entra ao enviar.</p>
              {noActivePipelines ? (
                <div className="rounded-md border border-dashed p-5 text-center text-sm">
                  <AlertTriangle className="w-5 h-5 mx-auto text-amber-500 mb-2" />
                  <p className="font-medium mb-1">Nenhum pipeline ativo</p>
                  <p className="text-xs text-muted-foreground mb-3">Crie um pipeline antes de salvar este formulário.</p>
                  <Link href="/pipelines"><Button size="sm" variant="outline">Criar pipeline</Button></Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Pipeline</Label>
                    <Select value={pipelineId} onValueChange={(v) => {
                      setPipelineId(v);
                      const p = pipelines.find((x) => x.id === v);
                      const first = p?.stages.find((s: any) => !s.isArchived);
                      setInitialStageId(first?.id || '');
                    }}>
                      <SelectTrigger><SelectValue placeholder="Escolha um pipeline" /></SelectTrigger>
                      <SelectContent>
                        {pipelines.filter((p) => !p.isArchived).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? ' • padrão' : ''}</SelectItem>
                        ))}
                        {/* Pipeline atual arquivado: exibir para sinalizar */}
                        {pipelineArchived && currentPipeline && (
                          <SelectItem value={currentPipeline.id}>{currentPipeline.name} (arquivado)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {pipelineArchived && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Pipeline arquivado. Escolha um pipeline ativo.</p>
                    )}
                  </div>
                  <div>
                    <Label>Etapa inicial</Label>
                    <Select value={initialStageId} onValueChange={setInitialStageId} disabled={!pipelineId || availableStages.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder={!pipelineId ? 'Selecione um pipeline primeiro' : (availableStages.length === 0 ? 'Pipeline sem etapas ativas' : 'Escolha a etapa inicial')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStages.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>
                          </SelectItem>
                        ))}
                        {stageArchived && currentStage && (
                          <SelectItem value={currentStage.id}>{currentStage.name} (arquivada)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {stageArchived && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Etapa arquivada. Escolha uma etapa ativa.</p>
                    )}
                  </div>
                  {currentPipeline && currentStage && !pipelineArchived && !stageArchived && (
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 flex items-center gap-2">
                      <ChevronRight className="w-3 h-3" />
                      Leads cairão em <strong className="text-foreground">{currentPipeline.name}</strong> → <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStage.color }} /><strong className="text-foreground">{currentStage.name}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-4">Configurações públicas</h3>
              <div className="space-y-3">
                <div><Label>Título público</Label><Input value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} /></div>
                <div><Label>Descrição</Label><Textarea value={publicDescription} onChange={(e) => setPublicDescription(e.target.value)} rows={2} /></div>
                <div><Label>Mensagem de sucesso</Label><Input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} /></div>
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div><Label>Mensagem para lead não qualificado</Label><p className="text-xs text-muted-foreground">Tela exibida quando uma pergunta qualificatória encerra o cadastro.</p></div>
                  <Input value={dqTitle} onChange={(e) => setDqTitle(e.target.value)} placeholder="Título da tela" />
                  <Textarea value={dqMessage} onChange={(e) => setDqMessage(e.target.value)} rows={2} placeholder="Mensagem" />
                  <Input value={dqButtonText} onChange={(e) => setDqButtonText(e.target.value)} placeholder="Texto do botão" />
                  <Input value={dqRedirectUrl} onChange={(e) => setDqRedirectUrl(e.target.value)} placeholder="URL de redirecionamento opcional" />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Personalização visual</h3>
              <p className="text-xs text-muted-foreground mb-4">Sobrescreve o branding do tenant para este formulário. Deixe em branco para herdar.</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cor principal</Label>
                    <div className="flex gap-2"><Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-14 p-1 h-9" /><Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} /></div>
                  </div>
                  <div>
                    <Label>Cor do botão</Label>
                    <div className="flex gap-2"><Input type="color" value={buttonColor || primaryColor} onChange={(e) => setButtonColor(e.target.value)} className="w-14 p-1 h-9" /><Input value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} placeholder="herda" /></div>
                  </div>
                  <div>
                    <Label>Fundo</Label>
                    <div className="flex gap-2"><Input type="color" value={bgColor || '#ffffff'} onChange={(e) => setBgColor(e.target.value)} className="w-14 p-1 h-9" /><Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} placeholder="herda" /></div>
                  </div>
                  <div>
                    <Label>Texto</Label>
                    <div className="flex gap-2"><Input type="color" value={textColor || '#1e293b'} onChange={(e) => setTextColor(e.target.value)} className="w-14 p-1 h-9" /><Input value={textColor} onChange={(e) => setTextColor(e.target.value)} placeholder="herda" /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tema</Label>
                    <Select value={theme} onValueChange={(v: any) => setTheme(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="light">Claro</SelectItem><SelectItem value="dark">Escuro</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Logo do formulário (URL)</Label><Input value={formLogoUrl} onChange={(e) => setFormLogoUrl(e.target.value)} placeholder="https://... (deixe em branco para herdar do tenant)" /></div>
                <div><Label>Imagem de capa (URL opcional)</Label><Input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://..." /></div>
              </div>
            </Card>

            {selected ? (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading font-semibold">Editar pergunta {selectedIdx! + 1}</h3>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => moveField(selectedIdx!, -1)} disabled={selectedIdx === 0}>↑</Button>
                    <Button size="sm" variant="outline" onClick={() => moveField(selectedIdx!, 1)} disabled={selectedIdx === fields.length - 1}>↓</Button>
                    <Button size="sm" variant="outline" onClick={() => removeField(selectedIdx!)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div><Label>Pergunta</Label><Input value={selected.label} onChange={(e) => updateField(selectedIdx!, { label: e.target.value })} /></div>
                  <div><Label>Tipo de campo</Label>
                    <Select value={selected.fieldType} onValueChange={(v) => updateField(selectedIdx!, { fieldType: v, placeholder: selected.placeholder || defaultPlaceholderFor(v), ...ensureChoiceDefaults(v, selected) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Placeholder</Label><Input value={selected.placeholder || ''} onChange={(e) => updateField(selectedIdx!, { placeholder: e.target.value })} placeholder={defaultPlaceholderFor(selected.fieldType)} /></div>
                  <div><Label>Descrição (opcional)</Label><Input value={selected.description || ''} onChange={(e) => updateField(selectedIdx!, { description: e.target.value })} /></div>
                  {needsOptions && (
                    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                      <div className="space-y-2">
                        <Label>Como o lead pode responder?</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(['single', 'multiple'] as const).map((mode) => {
                            const checked = normalizeSelectionMode(selected.fieldType, selected.validationRules) === mode;
                            const disabled = selected.fieldType !== 'multi_select' && mode === 'multiple';
                            return (
                              <button key={mode} type="button" disabled={disabled} onClick={() => updateField(selectedIdx!, { validationRules: { ...(selected.validationRules || {}), selectionMode: mode } })} className={`rounded-md border p-3 text-left text-sm transition ${checked ? 'border-brand-500 bg-brand-50' : 'border-border hover:bg-muted'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                                <span className="font-medium">{mode === 'single' ? 'Apenas uma opção' : 'Várias opções'}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-3 rounded-md border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Label>Usar como pergunta qualificatória</Label>
                            <p className="text-xs text-muted-foreground">Se ativado, apenas respostas marcadas como qualificatórias permitirão que o lead continue o cadastro.</p>
                          </div>
                          <Switch
                            checked={isQualifier(selected.validationRules)}
                            onCheckedChange={(checked) => updateField(selectedIdx!, { validationRules: { ...(selected.validationRules || {}), isQualifier: checked, qualificationMode: normalizeQualificationMode(selected.validationRules) } })}
                          />
                        </div>
                        {isQualifier(selected.validationRules) && normalizeSelectionMode(selected.fieldType, selected.validationRules) === 'multiple' && (
                          <div>
                            <Label>Critério de qualificação</Label>
                            <Select value={normalizeQualificationMode(selected.validationRules)} onValueChange={(v: 'any' | 'all') => updateField(selectedIdx!, { validationRules: { ...(selected.validationRules || {}), qualificationMode: v } })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">Qualifica se marcar pelo menos uma opção qualificatória</SelectItem>
                                <SelectItem value="all">Qualifica somente se todas as opções marcadas forem qualificatórias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Opções de resposta</Label>
                        <p className="text-xs text-muted-foreground">{normalizeSelectionMode(selected.fieldType, selected.validationRules) === 'multiple' ? 'O lead poderá escolher uma ou mais opções.' : 'O lead poderá escolher apenas uma opção.'}</p>
                        {normalizeOptionObjects(selected.options).map((option, optionIdx) => (
                          <div key={optionIdx} className="flex items-center gap-2 rounded-md border bg-background p-2">
                            <Input ref={(el) => { optionInputRefs.current[`${selectedIdx}-${optionIdx}`] = el; }} value={option.label} onChange={(e) => updateOption(selectedIdx!, optionIdx, e.target.value)} placeholder={`Opção ${optionIdx + 1}`} />
                            {isQualifier(selected.validationRules) && (
                              <label className="flex min-w-[120px] items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={option.qualifies === true}
                                  onChange={(e) => {
                                    const options = normalizeOptionObjects(selected.options);
                                    options[optionIdx] = { ...options[optionIdx], qualifies: e.target.checked };
                                    updateField(selectedIdx!, { options });
                                  }}
                                />
                                Qualifica
                              </label>
                            )}
                            <Button type="button" size="sm" variant="outline" onClick={() => moveOption(selectedIdx!, optionIdx, -1)} disabled={optionIdx === 0}>↑</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => moveOption(selectedIdx!, optionIdx, 1)} disabled={optionIdx === normalizeOptionObjects(selected.options).length - 1}>↓</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => removeOption(selectedIdx!, optionIdx)} disabled={normalizeOptionObjects(selected.options).length <= 2}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addOption(selectedIdx!)}><Plus className="mr-1 h-3 w-3" />Adicionar opção</Button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <Label htmlFor="req">Campo obrigatório</Label>
                    <Switch id="req" checked={selected.isRequired} onCheckedChange={(v) => updateField(selectedIdx!, { isRequired: v })} />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <ChevronRight className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Selecione uma pergunta à esquerda para editar.</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {showPreview && <PublicFormPreview
        publicTitle={publicTitle}
        publicDescription={publicDescription}
        primaryColor={primaryColor}
        successMessage={successMessage}
        fields={fields}
        disqualificationSettings={{ title: dqTitle, message: dqMessage, buttonText: dqButtonText, redirectUrl: dqRedirectUrl || null }}
        onClose={() => setShowPreview(false)}
      />}
    </div>
  );
}
