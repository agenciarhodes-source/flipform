export const WHATSAPP_CONNECTION_CHANGED_EVENT = 'flipform:whatsapp-connection-changed';

export function notifyWhatsAppConnectionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WHATSAPP_CONNECTION_CHANGED_EVENT));
}

export const CATALOG_CONNECTION_CHANGED_EVENT = 'flipform:catalog-connection-changed';
export function notifyCatalogConnectionChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CATALOG_CONNECTION_CHANGED_EVENT));
}
