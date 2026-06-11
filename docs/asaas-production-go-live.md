# Asaas production go-live — recebimento real

Este checklist prepara o FlipForm para receber pagamentos reais na conta Asaas dona da `ASAAS_API_KEY` configurada na Vercel. Nunca coloque a chave Asaas no frontend, em logs ou em arquivos versionados.

## 1. Trocar Sandbox para Produção

1. No painel da Vercel do app `app.flipform.com.br`, configure as variáveis de produção.
2. Troque `ASAAS_BASE_URL` do Sandbox para a URL de produção.
3. Substitua `ASAAS_API_KEY` pela chave real da conta Asaas que deve receber os pagamentos.
4. Faça redeploy da aplicação após salvar as envs.
5. Acesse o healthcheck interno como Super Admin para confirmar `status=ready`:
   - `https://app.flipform.com.br/api/admin/billing/asaas-health`

## 2. Envs obrigatórias na Vercel

| Env | Valor esperado em produção | Observação |
| --- | --- | --- |
| `ASAAS_API_KEY` | chave real da conta Asaas | Secret server-side; não expor no frontend. |
| `ASAAS_BASE_URL` | `https://api.asaas.com/v3` | Produção. Sandbox usa `https://api-sandbox.asaas.com/v3` ou `https://sandbox.asaas.com/api/v3`. |
| `ASAAS_WEBHOOK_TOKEN` | token forte configurado no painel Asaas | Deve bater com o header enviado pelo webhook. |
| `NEXT_PUBLIC_BASE_URL` | `https://app.flipform.com.br` | URL pública do app. |
| `PUBLIC_SITE_URL` | `https://flipform.com.br` | URL da landing usada pelo checkout/cancelamento. |
| `ASAAS_ENV` | `production` | Opcional, mas recomendado para diagnóstico explícito. Use `sandbox` ao voltar para Sandbox. |
| `ALLOW_SANDBOX_ASAAS_IN_PRODUCTION` | `false` | Só use `true` temporariamente em incidentes controlados. |

## 3. Configurar webhook no painel Asaas

Crie/edite o webhook de pagamentos no painel Asaas de produção:

- URL: `https://app.flipform.com.br/api/webhooks/asaas`
- Token/header: mesmo valor de `ASAAS_WEBHOOK_TOKEN` na Vercel.
- Eventos necessários:
  - `PAYMENT_CONFIRMED`
  - `PAYMENT_RECEIVED`
  - `PAYMENT_OVERDUE`
  - `PAYMENT_DELETED` / `PAYMENT_CANCELED`, se disponível no painel.

O app rejeita requisições sem token válido e mantém idempotência pelo registro de evento do provedor.

## 4. Teste com cobrança real pequena

1. Use a landing `https://flipform.com.br` para iniciar um checkout público com um plano ativo.
2. Confirme que o endpoint retorna um link de pagamento Asaas.
3. Pague uma cobrança real pequena com um método de baixa fricção.
4. No painel Asaas de produção, confirme:
   - cobrança criada;
   - pagamento confirmado/recebido;
   - valor refletido no saldo/extrato da conta correta.
5. No FlipForm, confirme:
   - webhook recebido em `/api/webhooks/asaas`;
   - assinatura/tenant ativado;
   - `allowed_user` do cliente ativado;
   - e-mail de primeiro acesso enviado ou fluxo de primeiro acesso disponível;
   - cliente consegue fazer login em `https://app.flipform.com.br`.

## 5. Conferências contra erro de ambiente

Antes do go-live, valide no healthcheck interno:

- `apiKeyConfigured=true`;
- `environment=production`;
- `baseUrl=https://api.asaas.com/v3`;
- `webhookTokenConfigured=true`;
- `nextPublicBaseUrlConfigured=true`;
- `publicSiteUrlConfigured=true`;
- `status=ready`;
- `warnings=[]`.

Se `environment=sandbox` em produção, pare o go-live e corrija `ASAAS_BASE_URL`/`ASAAS_ENV` antes de aceitar pagamentos reais.

## 6. Voltar para Sandbox em caso de erro

1. Na Vercel, altere:
   - `ASAAS_BASE_URL` para a URL de Sandbox;
   - `ASAAS_API_KEY` para a chave Sandbox;
   - `ASAAS_ENV=sandbox`.
2. Garanta que `ALLOW_SANDBOX_ASAAS_IN_PRODUCTION=true` só seja usado temporariamente e com registro do incidente.
3. Faça redeploy.
4. Desative ou ajuste o webhook de produção no painel Asaas para evitar eventos reais em ambiente de teste.
5. Rode um teste de checkout Sandbox antes de reabrir o fluxo público.

## 7. Observações de segurança

- A conta que recebe o dinheiro é sempre a conta dona da `ASAAS_API_KEY` configurada no ambiente da Vercel.
- O checkout usa o preço do banco (`plans.price`) e não aceita preço enviado pelo frontend.
- Iniciar checkout não libera acesso; a liberação ocorre apenas após evento de pagamento confirmado/recebido no webhook.
- O CORS do checkout público deve permanecer limitado a `https://flipform.com.br` e `https://www.flipform.com.br`.
