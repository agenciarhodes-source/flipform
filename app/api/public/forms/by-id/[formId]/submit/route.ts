import { submitPublicForm } from '@/lib/forms/public-submit-handler';

export async function POST(req: Request, ctx: { params: Promise<{ formId: string }> }) {
  return submitPublicForm(req, { formId: (await ctx.params).formId });
}
