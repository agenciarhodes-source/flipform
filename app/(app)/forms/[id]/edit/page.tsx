import { FormBuilder } from '@/components/form-builder';

export default async function EditFormPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <FormBuilder formId={params.id} />;
}
