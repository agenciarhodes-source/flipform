export const WHATSAPP_CONNECTION_CHANGED_EVENT = 'flipform:whatsapp-connection-changed';

export function notifyWhatsAppConnectionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WHATSAPP_CONNECTION_CHANGED_EVENT));
}
