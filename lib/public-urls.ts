const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3000';
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3000';

function trimSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function normalizePath(path?: string) {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
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

export function appUrl(path?: string) {
  return `${getAppUrl()}${normalizePath(path)}`;
}

export function marketingUrl(path?: string) {
  return `${getMarketingUrl()}${normalizePath(path)}`;
}

export function adminUrl(path?: string) {
  return `${getAdminUrl()}${normalizePath(path)}`;
}

export function buildFirstAccessUrl(token: string) {
  return `${appUrl('/first-access')}?token=${encodeURIComponent(token)}`;
}

export function getAppLoginUrl() {
  return appUrl('/login');
}
