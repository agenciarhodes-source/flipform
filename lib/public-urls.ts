const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://flipform.com.br';
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.flipform.com.br';

function trimSlash(url: string) {
  return url.replace(/\/+$/, '');
}

export function getAppUrl() {
  return trimSlash(APP_URL);
}

export function getMarketingUrl() {
  return trimSlash(MARKETING_URL);
}

export function getAdminUrl() {
  return trimSlash(ADMIN_URL);
}

export function buildFirstAccessUrl(token: string) {
  return `${getAppUrl()}/first-access?token=${encodeURIComponent(token)}`;
}

export function getAppLoginUrl() {
  return `${getAppUrl()}/login`;
}
