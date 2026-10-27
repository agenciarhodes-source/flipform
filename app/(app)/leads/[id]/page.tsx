import { redirect } from 'next/navigation';

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // O detalhe vive como modal em /kanban e /leads. Redireciona…
  redirect(`/leads?id=${params.id}`);
}
