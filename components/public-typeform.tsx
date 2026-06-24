'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { cleanOptionObjects, cleanOptions, evaluateQualification, formatBrazilPhone, formatCnpj, formatCpf, isValidBrazilMobilePhone, isValidCnpj, isValidCpf, isValidEmail, normalizeBrazilPhone, normalizeCnpj, normalizeCpf, normalizeEmail, normalizeSelectionMode, requiresOptions } from '@/lib/form-field-validation';

interface PublicField {
  id: string;
  label: string;
  placeholder?: string | null;
  description?: string | null;
  fieldType: string;
  options?: any[] | null;
  validationRules?: { selectionMode?: 'single' | 'multiple'; isQualifier?: boolean; qualificationMode?: 'any' | 'all'; [key: string]: unknown } | null;
  isRequired: boolean;
  orderIndex: number;
}

interface Props {
  form: {
    publicTitle: string; publicDescription?: string | null;
    primaryColor: string;
    bgColor?: string | null; buttonColor?: string | null; textColor?: string | null;
    theme?: string | null; coverImageUrl?: string | null;
    successMessage: string; logoUrl?: string | null; tenantName?: string;
    disqualificationSettings?: { title?: string; message?: string; buttonText?: string; redirectUrl?: string | null } | null;
    fields: PublicField[];
  };
  onSubmit: (answers: { fieldId: string; label: string; value: any }[]) => Promise<any>;
  previewMode?: boolean;
}

export function PublicTypeform({ form, onSubmit, previewMode }: Props) {
  const fields = [...form.fields].sort((a, b) => a.orderIndex - b.orderIndex);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [disqualified, setDisqualified] = useState(false);
  const [error, setError] = useState('');
  const submitGuard = useRef(false);

  const tenantInitials = (form.tenantName || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  if (fields.length === 0) {
    return <div className="min-h-full flex items-center justify-center bg-white p-8"><div className="text-muted-foreground">Adicione perguntas para visualizar.</div></div>;
  }

  const current = fields[step];
  const progress = ((step) / fields.length) * 100;
  const isLast = step === fields.length - 1;

  const setVal = (v: any) => setAnswers({ ...answers, [current.id]: v });

  const validate = () => {
    const val = answers[current.id];
    if (current.isRequired && (val === undefined || val === '' || (Array.isArray(val) && val.length === 0))) {
      if (requiresOptions(current.fieldType)) {
        setError(normalizeSelectionMode(current.fieldType, current.validationRules) === 'multiple' ? 'Selecione pelo menos uma opção.' : 'Selecione uma opção.');
      } else {
        setError('Este campo é obrigatório.');
      }
      return false;
    }
    if (requiresOptions(current.fieldType) && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      const allowed = cleanOptions(current.options);
      const mode = normalizeSelectionMode(current.fieldType, current.validationRules);
      if (mode === 'single' && (Array.isArray(val) || !allowed.includes(String(val)))) {
        setError('Selecione uma opção válida.');
        return false;
      }
      if (mode === 'multiple' && (!Array.isArray(val) || val.some((item) => !allowed.includes(String(item))))) {
        setError('Selecione pelo menos uma opção válida.');
        return false;
      }
    }
    if (current.fieldType === 'email' && val && !isValidEmail(val)) {
      setError('Informe um e-mail válido.');
      return false;
    }
    if ((current.fieldType === 'phone' || current.fieldType === 'phone_br') && val && !isValidBrazilMobilePhone(val)) {
      setError('Informe um telefone válido com DDD.');
      return false;
    }
    if (current.fieldType === 'cpf' && val && !isValidCpf(val)) {
      setError('Informe um CPF válido com 11 dígitos.');
      return false;
    }
    if (current.fieldType === 'cnpj' && val && !isValidCnpj(val)) {
      setError('Informe um CNPJ válido com 14 dígitos.');
      return false;
    }
    setError('');
    return true;
  };

  const next = async () => {
    if (!validate()) return;
    if (!evaluateQualification(current, answers[current.id])) { setDisqualified(true); return; }
    if (isLast) {
      if (previewMode) { setDone(true); return; }
      if (submitGuard.current || submitting) return; // guard contra double-click
      submitGuard.current = true;
      setSubmitting(true);
      try {
        const result = await onSubmit(fields.map((f) => ({ fieldId: f.id, label: f.label, value: normalizeAnswerForSubmit(f, answers[f.id]) })));
        if ((result as any)?.qualified === false) setDisqualified(true); else setDone(true);
      } catch (e: any) {
        setError(e?.message || 'Erro ao enviar. Tente novamente.');
        submitGuard.current = false;
      } finally {
        setSubmitting(false);
      }
    } else { setStep(step + 1); }
  };

  const prev = () => { if (step > 0) { setStep(step - 1); setError(''); } };

  // Tema do formulário
  const isDark = form.theme === 'dark';
  const buttonColor = form.buttonColor || form.primaryColor;
  const themeBgClass = isDark ? '' : 'bg-gradient-to-br from-white to-slate-50';
  const themeBgStyle: React.CSSProperties = form.bgColor
    ? { backgroundColor: form.bgColor, backgroundImage: 'none' as any }
    : isDark
    ? { backgroundColor: '#0f172a', backgroundImage: 'none' as any }
    : {};
  const textStyle: React.CSSProperties = form.textColor
    ? { color: form.textColor }
    : isDark
    ? { color: '#e2e8f0' }
    : {};

  if (disqualified) {
    const settings = form.disqualificationSettings || {};
    const redirectUrl = settings.redirectUrl || null;
    return (
      <div className={`min-h-full flex items-center justify-center p-6 ${themeBgClass}`} style={themeBgStyle}>
        <div className="max-w-md w-full text-center animate-fade-in" style={textStyle}>
          <h2 className="font-heading text-2xl font-bold mb-2">{settings.title || 'Obrigado pelo interesse'}</h2>
          <p className={isDark ? 'text-slate-400' : 'text-muted-foreground'}>{settings.message || 'No momento, seu perfil não atende aos critérios necessários para continuar este cadastro.'}</p>
          {redirectUrl && <Button className="mt-6 text-white" style={{ backgroundColor: buttonColor }} onClick={() => { window.location.href = redirectUrl; }}>{settings.buttonText || 'Entendi'}</Button>}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`min-h-full flex items-center justify-center p-6 ${themeBgClass}`} style={themeBgStyle}>
        <div className="max-w-md w-full text-center animate-fade-in" style={textStyle}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${form.primaryColor}22` }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: form.primaryColor }} />
          </div>
          <h2 className="font-heading text-2xl font-bold mb-2">{form.successMessage}</h2>
          <p className={isDark ? 'text-slate-400' : 'text-muted-foreground'}>Você já pode fechar esta janela.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-full flex flex-col ${themeBgClass}`} style={themeBgStyle}>
      {form.coverImageUrl && (
        <div className="w-full h-32 lg:h-40 bg-cover bg-center" style={{ backgroundImage: `url(${form.coverImageUrl})` }} />
      )}
      {/* Progress */}
      <div className={`h-1.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: form.primaryColor }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-10" style={textStyle}>
        <div className="max-w-xl w-full animate-fade-in" key={step}>
          {/* Branding do tenant */}
          {(form.logoUrl || form.tenantName) && (
            <div className="flex items-center gap-2 mb-6">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt={form.tenantName || ''} className="w-9 h-9 rounded-md object-contain bg-white border p-0.5" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-9 h-9 rounded-md flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: form.primaryColor }}>
                  {tenantInitials || '?'}
                </div>
              )}
              {form.tenantName && <span className="text-sm font-medium text-foreground/80">{form.tenantName}</span>}
            </div>
          )}

          {step === 0 && form.publicTitle && (
            <div className="mb-6">
              <h1 className="font-heading text-2xl lg:text-3xl font-bold mb-2">{form.publicTitle}</h1>
              {form.publicDescription && <p className="text-muted-foreground">{form.publicDescription}</p>}
            </div>
          )}

          <div className="flex items-start gap-3 mb-4">
            <span className="font-heading font-bold text-sm pt-1" style={{ color: form.primaryColor }}>{step + 1} →</span>
            <div className="flex-1">
              <h2 className="font-heading text-xl lg:text-2xl font-bold">
                {current.label}
                {current.isRequired && <span className="text-red-500 ml-1">*</span>}
              </h2>
              {current.description && <p className="text-muted-foreground text-sm mt-1">{current.description}</p>}
            </div>
          </div>

          <FieldRenderer field={current} value={answers[current.id]} onChange={setVal} primaryColor={form.primaryColor} onEnter={next} />

          {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

          <div className="flex items-center justify-between mt-8">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={prev} disabled={step === 0}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
            </div>
            <Button onClick={next} disabled={submitting} style={{ backgroundColor: buttonColor }} className="text-white hover:opacity-90 min-w-[110px]">
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Enviando...</>
              ) : isLast ? (
                <>Enviar <Check className="w-4 h-4 ml-1" /></>
              ) : (
                <>Próximo <ArrowRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-4">Pergunta {step + 1} de {fields.length}</div>
        </div>
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, primaryColor, onEnter }: { field: PublicField; value: any; onChange: (v: any) => void; primaryColor: string; onEnter: () => void }) {
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); } };
  const baseStyle = { borderColor: primaryColor };

  switch (field.fieldType) {
    case 'long_text':
      return <Textarea value={value || ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} rows={4} className="text-base" />;
    case 'single_select':
    case 'dropdown':
    case 'multi_select': {
      const mode = normalizeSelectionMode(field.fieldType, field.validationRules);
      if (mode === 'single') {
        return (
          <div className="space-y-2">
            {cleanOptionObjects(field.options).map((option) => { const opt = option.label; return (
              <button key={opt} type="button" onClick={() => onChange(opt)} className={`w-full text-left p-3 rounded-md border-2 transition ${value === opt ? 'bg-opacity-10' : 'hover:bg-slate-50'}`} style={value === opt ? { ...baseStyle, backgroundColor: `${primaryColor}11` } : { borderColor: '#E2E8F0' }}>
                <span className="mr-2">{value === opt ? '●' : '○'}</span>{opt}
              </button>
            ); })}
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {cleanOptionObjects(field.options).map((option) => {
            const opt = option.label;
            const arr: string[] = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => onChange(checked ? arr.filter((x) => x !== opt) : [...arr, opt])} className={`w-full text-left p-3 rounded-md border-2 flex items-center gap-3 transition ${checked ? '' : 'hover:bg-slate-50'}`} style={checked ? { ...baseStyle, backgroundColor: `${primaryColor}11` } : { borderColor: '#E2E8F0' }}>
                <div className="w-5 h-5 rounded border-2 flex items-center justify-center" style={{ borderColor: checked ? primaryColor : '#CBD5E1', backgroundColor: checked ? primaryColor : 'transparent' }}>{checked && <Check className="w-3 h-3 text-white" />}</div>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    case 'rating':
      return (
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onChange(n); setTimeout(onEnter, 200); }}
              className="w-12 h-12 rounded-md border-2 font-semibold transition"
              style={value === n ? { borderColor: primaryColor, backgroundColor: primaryColor, color: 'white' } : { borderColor: '#E2E8F0' }}
            >{n}</button>
          ))}
        </div>
      );
    case 'date':
      return <Input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} className="text-base" />;
    case 'number':
      return <Input type="number" value={value || ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} className="text-base" />;
    case 'email':
      return <Input type="email" value={value || ''} placeholder={field.placeholder || 'nome@email.com'} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} className="text-base" />;
    case 'phone':
    case 'phone_br':
      return <Input type="tel" value={value || '+55'} placeholder={field.placeholder || '+55 (00) 9 0000-0000'} onChange={(e) => onChange(formatBrazilPhone(e.target.value))} onKeyDown={handleKey} className="text-base" />;
    case 'cpf':
      return <Input inputMode="numeric" value={value || ''} placeholder={field.placeholder || '000.000.000-00'} onChange={(e) => onChange(formatCpf(e.target.value))} onKeyDown={handleKey} className="text-base" />;
    case 'cnpj':
      return <Input inputMode="numeric" value={value || ''} placeholder={field.placeholder || '00.000.000/0000-00'} onChange={(e) => onChange(formatCnpj(e.target.value))} onKeyDown={handleKey} className="text-base" />;
    case 'url':
      return <Input type="url" value={value || ''} placeholder={field.placeholder || 'https://'} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} className="text-base" />;
    default:
      return <Input value={value || ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} className="text-base" autoFocus />;
  }
}

function normalizeAnswerForSubmit(field: PublicField, value: any) {
  if (value === undefined) return null;
  if (field.fieldType === 'email' && value) return normalizeEmail(value);
  if ((field.fieldType === 'phone' || field.fieldType === 'phone_br') && value) return normalizeBrazilPhone(value);
  if (field.fieldType === 'cpf' && value) return normalizeCpf(value);
  if (field.fieldType === 'cnpj' && value) return normalizeCnpj(value);
  return value;
}
