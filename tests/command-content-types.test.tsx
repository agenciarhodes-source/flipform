import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export function CommandTypeContract() {
  return (
    <Command
      filter={(value, search) =>
        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
      }
    >
      <CommandInput placeholder="Pesquise uma cidade..." />
      <CommandList className="max-h-[300px]">
        <CommandEmpty>Nenhuma cidade encontrada</CommandEmpty>
        <CommandGroup heading="Cidades">
          <CommandItem value="São Luís" onSelect={() => undefined}>
            São Luís
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
