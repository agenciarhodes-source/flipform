'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FLIP_AI_AVATAR_MAX_BYTES,
  isSupportedFlipAiAvatarMimeType,
} from '@/lib/flip-ai/avatar';

export function AgentAvatarPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');

  function load(file: File) {
    if (disabled) return;
    if (!isSupportedFlipAiAvatarMimeType(file.type)) {
      setMessage('Formato inválido. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > FLIP_AI_AVATAR_MAX_BYTES) {
      setMessage('A foto deve ter no máximo 120 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setMessage('Não foi possível ler a foto.');
        return;
      }
      onChange(reader.result);
      setMessage('Foto carregada. Salve o atendente para aplicar.');
    };
    reader.onerror = () => setMessage('Não foi possível ler a foto.');
    reader.readAsDataURL(file);
  }

  return <div className="space-y-2 sm:col-span-2">
    <div className="flex flex-wrap items-center gap-3">
      {value ? <Image src={value} alt="Prévia da foto do atendente" width={64} height={64}
        unoptimized className="h-16 w-16 rounded-full border object-cover" />
        : <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted">
          <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <UploadCloud className="mr-2 h-4 w-4" />{value ? 'Trocar foto' : 'Adicionar foto'}
        </Button>
        {value ? <Button type="button" variant="outline" disabled={disabled} onClick={() => {
          onChange(''); setMessage('Foto removida. Salve para aplicar.');
        }}><Trash2 className="mr-2 h-4 w-4" />Remover</Button> : null}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Foto quadrada em PNG, JPG ou WebP, com até 120 KB. Sem foto, serão usadas as iniciais.</p>
    {message ? <p className="text-xs" role="status">{message}</p> : null}
    <input ref={inputRef} className="sr-only" type="file"
      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={disabled}
      onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) load(file); event.currentTarget.value = ''; }} />
  </div>;
}

