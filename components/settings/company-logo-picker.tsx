'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  TENANT_LOGO_MAX_BYTES,
  isSupportedTenantLogoMimeType,
} from '@/lib/tenant-logo';

interface CompanyLogoPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CompanyLogoPicker({ value, onChange, disabled = false }: CompanyLogoPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const loadFile = (file: File) => {
    if (disabled) return;

    if (!isSupportedTenantLogoMimeType(file.type)) {
      toast.error('Formato inválido. Envie uma imagem PNG, JPG ou WebP.');
      return;
    }

    if (file.size > TENANT_LOGO_MAX_BYTES) {
      toast.error('A logo deve ter no máximo 120 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        toast.error('Não foi possível ler a imagem selecionada.');
        return;
      }
      onChange(reader.result);
      toast.success('Logo carregada. Salve as alterações para aplicar.');
    };
    reader.onerror = () => toast.error('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) loadFile(file);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-1.5">
          <ImagePlus className="h-3.5 w-3.5" />Logo da empresa
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WebP de até 120 KB.</p>
      </div>

      {value && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-2">
            <img src={value} alt="Prévia da logo da empresa" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Logo configurada</p>
            <p className="text-xs text-muted-foreground">Você pode substituir a imagem arrastando outra logo ou escolhendo um arquivo.</p>
          </div>
          {!disabled && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange('')}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
            </Button>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) setDragActive(false);
        }}
        onDrop={handleDrop}
        className={`flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-6 text-center transition ${
          disabled
            ? 'cursor-not-allowed opacity-60'
            : dragActive
              ? 'cursor-copy border-brand-500 bg-brand-50'
              : 'cursor-pointer border-border hover:border-brand-400 hover:bg-muted/40'
        }`}
      >
        <UploadCloud className="mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">Arraste a logo até aqui</p>
        <p className="mt-1 text-xs text-muted-foreground">ou clique para escolher uma imagem do seu dispositivo</p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          disabled={disabled}
          onChange={handleInputChange}
        />
      </div>

      {!value && <p className="text-xs text-muted-foreground">Sem logo, o Flipform continua usando as iniciais da empresa como fallback.</p>}
    </div>
  );
}
