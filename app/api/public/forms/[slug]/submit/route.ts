import { submitPublicForm } from '@/lib/forms/public-submit-handler';

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return submitPublicForm(req, { slug: (await ctx.params).slug });
}
