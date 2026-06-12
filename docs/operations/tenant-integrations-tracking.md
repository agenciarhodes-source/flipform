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


## Variável de ambiente obrigatória

A feature de Integrações exige a variável `INTEGRATION_SECRET_KEY` configurada no ambiente de produção (Vercel) e nos ambientes que salvam credenciais reais.

Regras operacionais:
- Deve ter pelo menos 16 caracteres.
- Deve ser configurada como variável de ambiente server-side na Vercel.
- É usada para criptografar tokens sensíveis, como token da API da Meta e segredo da API do GA4.
- Não deve ser exposta no frontend, em código client-side, logs ou respostas de API.
- Trocar essa chave pode impedir a descriptografia de tokens já salvos; faça rotação apenas com plano de migração/regravação dos segredos.

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
