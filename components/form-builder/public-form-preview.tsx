'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PublicTypeform } from '@/components/public-typeform';

export function PublicFormPreview({ publicTitle, publicDescription, primaryColor, successMessage, disqualificationSettings, fields, onClose }: any) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="h-[80vh]">
          <PublicTypeform
            form={{ publicTitle, publicDescription, primaryColor, successMessage, disqualificationSettings, fields: fields.map((f: any, i: number) => ({ ...f, id: f.id || `tmp-${i}` })) }}
            onSubmit={async () => { /* preview only */ }}
            previewMode
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
