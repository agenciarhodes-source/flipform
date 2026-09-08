'use client';

export const META_PIXEL_ID_PATTERN = /^[0-9]{5,30}$/;

type MetaFbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: MetaFbq;
};

declare global {
  interface Window { fbq?: MetaFbq; _fbq?: MetaFbq }
}

const initializedPixels = new Set<string>();
const pageViewedPixels = new Set<string>();
const SCRIPT_ID = 'flipform-meta-pixel-script';

function ensureMetaPixel(): MetaFbq | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (window.fbq) return window.fbq;

  const fbq: MetaFbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    // Loading is best-effort. The queue and the public form UX remain intact
    // if an ad blocker prevents this script from loading.
    script.onerror = () => undefined;
    document.head.appendChild(script);
  }
  return fbq;
}

function initPixel(fbq: MetaFbq, pixelId: string) {
  if (initializedPixels.has(pixelId)) return;
  fbq('init', pixelId);
  initializedPixels.add(pixelId);
}

/**
 * Load the first-party Pixel as soon as the public form opens. Besides PageView,
 * this gives Meta a chance to create _fbp/_fbc before the user submits the form.
 */
export function initializeMetaPixel(pixelIdInput: string | null | undefined): boolean {
  const pixelId = pixelIdInput?.trim() || '';
  if (!META_PIXEL_ID_PATTERN.test(pixelId)) return false;
  try {
    const fbq = ensureMetaPixel();
    if (!fbq) return false;
    initPixel(fbq, pixelId);
    if (!pageViewedPixels.has(pixelId)) {
      fbq('track', 'PageView');
      pageViewedPixels.add(pixelId);
    }
    return true;
  } catch {
    return false;
  }
}

export function fireMetaLeadPixel(input: { pixelId: string; eventId: string }): boolean {
  const pixelId = input.pixelId.trim();
  const eventId = input.eventId.trim();
  if (!META_PIXEL_ID_PATTERN.test(pixelId) || !eventId) return false;

  try {
    const fbq = ensureMetaPixel();
    if (!fbq) return false;
    initPixel(fbq, pixelId);
    fbq('track', 'Lead', {}, { eventID: eventId });
    return true;
  } catch {
    return false;
  }
}

export type PublicFormSubmitResponse =
  | {
      ok: true;
      leadId: string;
      successMessage: string;
      qualified: true;
      tracking?: { meta: { pixelId: string; eventId: string } };
    }
  | {
      ok: true;
      qualified: false;
      disqualification?: {
        title?: string;
        message?: string;
        buttonText?: string;
        redirectUrl?: string | null;
      } | null;
    };
