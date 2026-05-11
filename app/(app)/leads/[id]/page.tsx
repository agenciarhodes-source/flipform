import { redirect } from 'next/navigation';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  // O detalhe vive como modal em /kanban e /leads. Redireciona…
  redirect(`/leads?id=${params.id}`);
}
