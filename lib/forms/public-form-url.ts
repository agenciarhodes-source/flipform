export type PublicFormUrlState = 'default' | 'custom_pending' | 'custom_active';

export type PublicFormUrlDomain = {
  domain: string;
  status: string;
  verificationStatus: string;
  sslStatus: string;
};

function cleanDomain(value: string) {
  return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

export function buildPublicFormUrlState(params: {
  slug: string;
  formId?: string;
  appDomain: string;
  primaryDomain?: PublicFormUrlDomain | null;
}) {
  const cleanSlug = params.slug.replace(/^\/+/, '');
  const appDomain = cleanDomain(params.appDomain);
  const legacyFallbackUrl = `https://${appDomain}/f/${cleanSlug}`;
  const fallbackUrl = params.formId ? `https://${appDomain}/f/id/${encodeURIComponent(params.formId)}/${cleanSlug}` : legacyFallbackUrl;

  if (!params.primaryDomain) {
    return {
      activeUrl: fallbackUrl,
      customUrl: null,
      state: 'default' as const,
      label: 'Link padrão do FlipForm.',
    };
  }

  const primaryDomain = cleanDomain(params.primaryDomain.domain);
  const customUrl = `https://${primaryDomain}/${cleanSlug}`;
  const isReady =
    params.primaryDomain.status === 'active' &&
    params.primaryDomain.verificationStatus === 'verified' &&
    params.primaryDomain.sslStatus === 'active';

  if (!isReady) {
    return {
      activeUrl: fallbackUrl,
      customUrl,
      state: 'custom_pending' as const,
      label: 'Link padrão ativo enquanto o domínio personalizado aguarda ativação.',
    };
  }

  return {
    activeUrl: customUrl,
    customUrl,
    state: 'custom_active' as const,
    label: 'Link gerado com o domínio personalizado ativo.',
  };
}

export function buildPublicFormUrl(params: {
  slug: string;
  formId?: string;
  appDomain: string;
  primaryDomain?: string | PublicFormUrlDomain | null;
}) {
  const primaryDomain = typeof params.primaryDomain === 'string'
    ? { domain: params.primaryDomain, status: 'active', verificationStatus: 'verified', sslStatus: 'active' }
    : params.primaryDomain;

  return buildPublicFormUrlState({
    slug: params.slug,
    formId: params.formId,
    appDomain: params.appDomain,
    primaryDomain,
  }).activeUrl;
}
