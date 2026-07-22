'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getCitiesByState, normalizeLocationText } from '@/lib/brazil-locations';

type CityComboboxProps = { state: string | null | undefined; value: string | null | undefined; onValueChange: (city: string) => void; disabled?: boolean; allowEmpty?: boolean; placeholder?: string; className?: string; };

export function CityCombobox({ state, value, onValueChange, disabled = false, allowEmpty = false, placeholder = 'Selecione uma cidade', className }: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const cities = useMemo(() => getCitiesByState(state || ''), [state]);
  const unavailable = disabled || !state;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label="Cidade" disabled={unavailable} className={cn('w-full justify-between font-normal', className)}>
        <span className="truncate">{value || (state ? placeholder : 'Selecione um estado primeiro')}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start" collisionPadding={16}>
      <Command filter={(item, search) => normalizeLocationText(item).includes(normalizeLocationText(search)) ? 1 : 0}>
        <CommandInput placeholder="Pesquise uma cidade..." />
        <CommandList className="max-h-[min(300px,calc(100vh-12rem))]">
          <CommandEmpty>Nenhuma cidade encontrada</CommandEmpty>
          <CommandGroup>
            {allowEmpty && <CommandItem value="__empty__" onSelect={() => { onValueChange(''); setOpen(false); }}><Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />Sem cidade</CommandItem>}
            {cities.map((city) => <CommandItem key={city} value={city} onSelect={() => { onValueChange(city); setOpen(false); }}><Check className={cn('mr-2 h-4 w-4', normalizeLocationText(value || '') === normalizeLocationText(city) ? 'opacity-100' : 'opacity-0')} />{city}</CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
