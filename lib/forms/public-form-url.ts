export function buildPublicFormUrl(params: {
  slug: string;
  appDomain: string;
  primaryDomain?: string | null;
}) {
  const cleanSlug = params.slug.replace(/^\/+/, '');
  const appDomain = params.appDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const primaryDomain = params.primaryDomain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

  if (primaryDomain) {
    return `https://${primaryDomain}/${cleanSlug}`;
  }

  return `https://${appDomain}/f/${cleanSlug}`;
}
