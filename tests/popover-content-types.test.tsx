import { PopoverContent } from '@/components/ui/popover';

export function PopoverContentTypeContract() {
  return (
    <PopoverContent
      align="start"
      side="bottom"
      sideOffset={8}
      collisionPadding={16}
      className="p-0"
      onEscapeKeyDown={() => undefined}
      onPointerDownOutside={() => undefined}
    >
      Conteúdo do popover
    </PopoverContent>
  );
}
