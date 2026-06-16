export function buildPublicFormUrl(params: { slug: string; primaryDomain?: string | null; appDomain: string }) {
  const appDomain = params.appDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (params.primaryDomain) return `https://${params.primaryDomain}/${params.slug}`;
  return `https://${appDomain}/f/${params.slug}`;
}
