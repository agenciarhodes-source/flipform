'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, GripVertical, Plus, Eye, Save, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PublicFormPreview } from './public-form-preview';

const FIELD_TYPES = [
  { v: 'short_text', l: 'Texto curto' },
  { v: 'long_text', l: 'Texto longo' },
  { v: 'name', l: 'Nome' },
  { v: 'email', l: 'E-mail' },
  { v: 'phone', l: 'Telefone' },
  { v: 'number', l: 'Número' },
  { v: 'date', l: 'Data' },
  { v: 'document', l: 'CPF/CNPJ' },
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
  options?: string[] | null;
  isRequired: boolean;
  orderIndex: number;
}

export function FormBuilder({ formId }: { formId?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [successMessage, setSuccessMessage] = useState('Obrigado pelo envio!');
  const [isActive, setIsActive] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!formId) {
      // Defaults p/ novo
      setName('Formulário sem título');
      setPublicTitle('Como podemos ajudar?');
      setFields([
        { label: 'Qual seu nome?', fieldType: 'name', isRequired: true, orderIndex: 0, placeholder: 'Seu nome' },
        { label: 'E-mail', fieldType: 'email', isRequired: true, orderIndex: 1, placeholder: 'voce@email.com' },
      ]);
      return;
    }
    fetch(`/api/forms/${formId}`).then((r) => r.json()).then((d) => {
      const f = d.form;
      setName(f.name);
      setPublicTitle(f.publicTitle);
      setPublicDescription(f.publicDescription || '');
      setPrimaryColor(f.primaryColor);
      setSuccessMessage(f.successMessage);
      setIsActive(f.isActive);
      setFields(f.fields.map((ff: any) => ({
        id: ff.id, label: ff.label, placeholder: ff.placeholder, description: ff.description,
        fieldType: ff.fieldType, options: ff.options, isRequired: ff.isRequired, orderIndex: ff.orderIndex,
      })));
    });
  }, [formId]);

  const addField = () => {
    setFields([...fields, { label: 'Nova pergunta', fieldType: 'short_text', isRequired: false, orderIndex: fields.length }]);
    setSelectedIdx(fields.length);
  };

  const updateField = (idx: number, patch: Partial<Field>) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
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
    setSaving(true);
    try {
      const payload = { name, publicTitle, publicDescription, primaryColor, successMessage, isActive, fields };
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
                  <div className="text-xs text-muted-foreground">{FIELD_TYPES.find(t => t.v === f.fieldType)?.l}</div>
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
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-4">Configurações públicas</h3>
              <div className="space-y-3">
                <div><Label>Título público</Label><Input value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} /></div>
                <div><Label>Descrição</Label><Textarea value={publicDescription} onChange={(e) => setPublicDescription(e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cor principal</Label>
                    <div className="flex gap-2"><Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-14 p-1 h-9" /><Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} /></div>
                  </div>
                  <div><Label>Mensagem de sucesso</Label><Input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} /></div>
                </div>
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
                    <Select value={selected.fieldType} onValueChange={(v) => updateField(selectedIdx!, { fieldType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Placeholder</Label><Input value={selected.placeholder || ''} onChange={(e) => updateField(selectedIdx!, { placeholder: e.target.value })} /></div>
                  <div><Label>Descrição (opcional)</Label><Input value={selected.description || ''} onChange={(e) => updateField(selectedIdx!, { description: e.target.value })} /></div>
                  {needsOptions && (
                    <div>
                      <Label>Opções (uma por linha)</Label>
                      <Textarea
                        value={(selected.options || []).join('\n')}
                        onChange={(e) => updateField(selectedIdx!, { options: e.target.value.split('\n').filter(Boolean) })}
                        rows={4}
                      />
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
        onClose={() => setShowPreview(false)}
      />}
    </div>
  );
}
