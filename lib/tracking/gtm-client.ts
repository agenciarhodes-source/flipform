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

/** Most a form waits for the Google tag before going to the next page (e.g. WhatsApp). */
export const GTM_LEAD_WAIT_MS = 1500;

/**
 * Same lead event, but waits until Google Tag Manager says its tags were sent (eventCallback),
 * up to GTM_LEAD_WAIT_MS. Forms that open WhatsApp right after the submission would otherwise
 * leave the page before the Google Ads conversion request goes out, and the conversion is lost.
 */
export function firePublicGtmLeadEventAndWait(containerId: string | null | undefined, timeoutMs = GTM_LEAD_WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (sent: boolean) => {
      if (settled) return;
      settled = true;
      resolve(sent);
    };
    try {
      if (!loadPublicGtmContainer(containerId)) return finish(false);
      const dataLayer = ensureDataLayer();
      if (!dataLayer) return finish(false);
      setTimeout(() => finish(false), timeoutMs);
      // Same PII-free payload as the plain lead event, plus GTM's standard completion callback.
      dataLayer.push({ event: FLIPFORM_LEAD_EVENT, eventCallback: () => finish(true), eventTimeout: timeoutMs });
    } catch {
      // A tracking failure must not change a successful form submission.
      finish(false);
    }
  });
}
