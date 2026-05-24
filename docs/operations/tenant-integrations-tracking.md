# Tenant Integrations & Tracking

## Objetivo
Permitir que cada tenant configure Pixel/GTM/Analytics sem programador.

## Integrações suportadas
- Meta Pixel
- Google Tag Manager
- Google Analytics 4
- Google Ads
- Eventos por Kanban

Quando um lead muda de etapa, o sistema consulta o mapeamento e dispara evento configurado.

Exemplos:
- Novo lead → Lead
- Qualificado → QualifiedLead
- Proposta enviada → InitiateCheckout
- Fechado/Ganho → Purchase

## Limitação importante
Eventos disparados a partir do painel interno podem não ter a mesma qualidade de atribuição que eventos capturados no navegador do cliente final. Para atribuição avançada, recomenda-se implementar Meta Conversions API em etapa futura.

## Segurança
- Não enviar dados pessoais crus para pixels.
- Não inserir scripts externos arbitrários sem revisão.
- Cada tenant usa apenas suas próprias configurações.

## Futuro
- Meta Conversions API
- fbp/fbc
- event_id
- deduplicação browser/server
- hash de email/telefone
- event match quality
