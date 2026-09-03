'use client';

import type { ChangeEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FORM_COVER_IMAGE_HEIGHT,
  FORM_COVER_IMAGE_MAX_BYTES,
  FORM_COVER_IMAGE_WIDTH,
  isSupportedFormCoverImageMimeType,
} from '@/lib/form-cover-image';

interface FormCoverImagePickerProps {
  value: string;
  onChange: (value: string) => void;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('INVALID_IMAGE'));
    };
    image.src = objectUrl;
  });
}

export function FormCoverImagePicker({ value, onChange }: FormCoverImagePickerProps) {
  const isUploadedImage = value.startsWith('data:image/');

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!isSupportedFormCoverImageMimeType(file.type)) {
      toast.error('Formato inválido. Envie uma imagem PNG, JPG ou WebP.');
      input.value = '';
      return;
    }

    if (file.size > FORM_COVER_IMAGE_MAX_BYTES) {
      toast.error('A imagem de capa deve ter no máximo 150 KB.');
      input.value = '';
      return;
    }

    try {
      const dimensions = await getImageDimensions(file);
      if (dimensions.width !== FORM_COVER_IMAGE_WIDTH || dimensions.height !== FORM_COVER_IMAGE_HEIGHT) {
        toast.error('A imagem de capa deve ter exatamente 500 × 500 px.');
        input.value = '';
        return;
      }
    } catch {
      toast.error('Não foi possível validar a imagem selecionada.');
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
      toast.success('Imagem de capa carregada. Salve o formulário para aplicar.');
    };
    reader.onerror = () => toast.error('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
    input.value = '';
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>Imagem de capa do formulário</Label>
        <p className="text-xs text-muted-foreground">Envie PNG, JPG ou WebP em 500 × 500 px, com até 150 KB, ou informe uma URL.</p>
      </div>

      {value && (
        <div className="flex items-center gap-3 rounded-md border bg-background p-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
            <img src={value} alt="Prévia da imagem de capa do formulário" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{isUploadedImage ? 'Imagem enviada do computador' : 'Capa configurada por URL'}</p>
            <p className="text-xs text-muted-foreground">Você pode substituir a imagem abaixo ou removê-la.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange('')}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
          </Button>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm font-medium transition hover:bg-muted/50">
        <ImagePlus className="h-4 w-4" />
        Escolher imagem de capa do computador
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
        placeholder="https://..."
      />
    </div>
  );
}
