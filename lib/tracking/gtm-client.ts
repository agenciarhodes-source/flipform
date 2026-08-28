export const FLIPFORM_LEAD_EVENT = 'flipform_lead';

const GTM_CONTAINER_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function normalizeGtmContainerId(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return GTM_CONTAINER_ID_PATTERN.test(normalized) ? normalized : null;
}

function ensureDataLayer() {
  if (typeof window === 'undefined') return null;
  const win = window as typeof window & { dataLayer?: Array<Record<string, unknown>> };
  if (!Array.isArray(win.dataLayer)) win.dataLayer = [];
  return win.dataLayer;
}

export function loadPublicGtmContainer(containerId: string | null | undefined) {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const normalized = normalizeGtmContainerId(containerId);
    if (!normalized) return false;

    const dataLayer = ensureDataLayer();
    if (!dataLayer) return false;

    const scriptId = `flipform-gtm-${normalized}`;
    if (document.getElementById(scriptId)) return true;

    dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(normalized)}`;
    document.head.appendChild(script);
    return true;
  } catch {
    // Tracking must never interrupt the public form experience.
    return false;
  }
}

export function firePublicGtmLeadEvent(containerId: string | null | undefined) {
  try {
    if (!loadPublicGtmContainer(containerId)) return false;
    const dataLayer = ensureDataLayer();
    if (!dataLayer) return false;

    // Keep the payload deliberately free of PII and internal lead identifiers.
    dataLayer.push({ event: FLIPFORM_LEAD_EVENT });
    return true;
  } catch {
    // A tracking failure must not change a successful form submission.
    return false;
  }
}
