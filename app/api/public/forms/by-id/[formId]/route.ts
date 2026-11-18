import { getPublicForm } from '@/lib/forms/public-get-handler';

export async function GET(req: Request, ctx: { params: Promise<{ formId: string }> }) {
  return getPublicForm(req, { formId: (await ctx.params).formId });
}
