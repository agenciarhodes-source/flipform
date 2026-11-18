import { renderPublicForm } from '../public-form-page';

export default async function PublicFormPage(props: { params: Promise<{ slug: string }> }) {
  return renderPublicForm({ slug: (await props.params).slug });
}
