import type { MetaPlatformReadiness } from './platform-readiness';

const REQUIRED_ROLLOUT_COMPONENTS = new Set(['base', 'ads', 'whatsapp', 'whatsapp_webhook']);
const OPTIONAL_COMPONENTS = new Set(['instagram', 'instagram_webhook']);

/**
 * Product rollout is intentionally narrower than the full Meta diagnostics.
 * Instagram remains visible as an optional diagnostic, but it does not block
 * the current Ads + WhatsApp rollout.
 */
export function buildMetaRolloutReadiness(readiness: MetaPlatformReadiness): MetaPlatformReadiness {
  const required = readiness.components.filter(component => REQUIRED_ROLLOUT_COMPONENTS.has(component.key));
  const rolloutReady = required.length === REQUIRED_ROLLOUT_COMPONENTS.size
    && required.every(component => component.status === 'ready');

  return {
    ...readiness,
    status: rolloutReady ? 'ready_for_external_validation' : 'action_required',
    summary: rolloutReady
      ? 'Ads e WhatsApp estão internamente prontos. Os gates externos da Meta ainda devem ser confirmados antes da liberação ampla para clientes.'
      : 'Existem pendências internas de Ads ou WhatsApp que devem ser resolvidas antes de liberar novas conexões para clientes.',
    components: readiness.components.map(component => OPTIONAL_COMPONENTS.has(component.key)
      ? {
          ...component,
          label: component.label.includes('(opcional)') ? component.label : `${component.label} (opcional)`,
          summary: component.status === 'ready'
            ? component.summary
            : `${component.summary} Esta pendência não bloqueia o rollout atual de Ads e WhatsApp.`,
        }
      : component),
    releaseGates: readiness.releaseGates.map(gate => gate.key === 'meta_app_review'
      ? {
          ...gate,
          detail: 'Confirme no painel da Meta que as permissões necessárias para os produtos liberados, especialmente Ads e WhatsApp, possuem o nível de acesso exigido para uso com contas de clientes.',
        }
      : gate),
  };
}
