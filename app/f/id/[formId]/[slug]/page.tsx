import { renderPublicForm } from '../../../public-form-page';

export default async function CanonicalPublicFormPage(props: { params: Promise<{ formId: string; slug: string }> }) {
  const { formId, slug } = await props.params;
  return renderPublicForm({ formId, slug });
}
