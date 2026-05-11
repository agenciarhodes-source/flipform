import { FormBuilder } from '@/components/form-builder';

export default function EditFormPage({ params }: { params: { id: string } }) {
  return <FormBuilder formId={params.id} />;
}
