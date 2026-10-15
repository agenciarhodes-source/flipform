/** A new message from a customer, as the notification feed hands it to the browser. */
export type MessageNotification = {
  id: string;
  conversationId: string;
  contact: string;
  preview: string;
  channel: string;
  createdAt: string;
  href: string;
};

export type MessageNotificationCursor = { createdAt: string; id: string | null };

export function messagePreview(type: string, text: string | null) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean) return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
  const labels: Record<string, string> = {
    audio: 'Mensagem de voz', image: 'Foto', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha',
  };
  return labels[type] || 'Nova mensagem';
}
