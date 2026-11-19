import { getPublicForm } from '@/lib/forms/public-get-handler';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return getPublicForm(req, { slug: (await ctx.params).slug });
}
