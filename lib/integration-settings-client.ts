export function normalizeIntegrationSettings(settings: any) {
  return {
    ...settings,
    metaPixelId: settings?.metaPixelId || '',
    metaAccessToken: '',
    metaTestEventCode: settings?.metaTestEventCode || '',
    gtmContainerId: settings?.gtmContainerId || '',
    ga4MeasurementId: settings?.ga4MeasurementId || '',
    ga4ApiSecret: '',
    googleAdsId: settings?.googleAdsId || '',
    googleAdsLabel: settings?.googleAdsLabel || '',
    whatsappFunnelEnabled: Boolean(settings?.whatsappFunnelEnabled),
  };
}
