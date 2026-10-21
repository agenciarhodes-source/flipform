/** Plain-Portuguese reason for a Google Funnel conversion that was not accepted. */
export function googleFunnelErrorText(code: string | null | undefined) {
  if (!code) return null;
  const known: Record<string, string> = {
    NO_IDENTIFIER: 'Lead sem identificador de clique do Google (não veio de um anúncio do Google)',
    CANCELLED_TEST: 'Teste cancelado',
  };
  return known[code] || `Google Ads recusou (${code})`;
}

const CATEGORY: Record<string, string> = {
  qualified_lead: 'Lead qualificado',
  converted_lead: 'Venda',
};

/** A Google Funnel conversion shown in the same list as the other tracking logs. */
export function googleFunnelLogRow(event: {
  id: string; leadId: string | null; conversionCategory: string; state: string; lastErrorCode: string | null; createdAt: Date;
}) {
  return {
    id: `google-funnel:${event.id}`,
    leadId: event.leadId,
    provider: 'google_ads',
    eventName: CATEGORY[event.conversionCategory] || event.conversionCategory,
    source: 'funil_google',
    status: event.state === 'SENT' ? 'sent' : event.state === 'FAILED' ? 'failed' : 'pending',
    reason: googleFunnelErrorText(event.lastErrorCode),
    eventId: null,
    createdAt: event.createdAt,
  };
}
