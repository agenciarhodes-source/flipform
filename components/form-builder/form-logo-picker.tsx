'use client';

import type { ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORM_LOGO_MAX_BYTES, isSupportedFormLogoMimeType } from '@/lib/form-logo';

interface FormLogoPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function FormLogoPicker({ value, onChange }: FormLogoPickerProps) {
  const isUploadedImage = value.startsWith('data:image/');

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!isSupportedFormLogoMimeType(file.type)) {
      toast.error('Formato inválido. Envie uma imagem PNG, JPG ou WebP.');
      input.value = '';
      return;
    }

    if (file.size > FORM_LOGO_MAX_BYTES) {
      toast.error('A logo deve ter no máximo 150 KB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        toast.error('Não foi possível ler a imagem selecionada.');
        return;
      }
      onChange(reader.result);
      toast.success('Logo carregada. Salve o formulário para aplicar.');
    };
    reader.onerror = () => toast.error('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
    input.value = '';
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>Logo do formulário</Label>
        <p className="text-xs text-muted-foreground">Envie PNG, JPG ou WebP de até 150 KB, ou informe uma URL.</p>
      </div>

      {value && (
        <div className="flex items-center gap-3 rounded-md border bg-background p-3">
          <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border bg-white p-1">
            <img src={value} alt="Prévia da logo do formulário" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{isUploadedImage ? 'Imagem enviada do computador' : 'Logo configurada por URL'}</p>
            <p className="text-xs text-muted-foreground">Você pode substituir a imagem abaixo ou removê-la.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange('')}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
          </Button>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm font-medium transition hover:bg-muted/50">
        <ImagePlus className="h-4 w-4" />
        Escolher imagem do computador
        <input
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={handleFile}
        />
      </label>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>ou use uma URL</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Input
        type="url"
        value={isUploadedImage ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://... (deixe em branco para herdar do tenant)"
      />
    </div>
  );
}
