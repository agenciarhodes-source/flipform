# Origem automática de leads por formulário

## Objetivo
Cada formulário armazena uma origem comercial em `forms.lead_source`. Na submissão pública, o backend copia esse valor para `leads.source`; a origem nunca é recebida do navegador, das respostas ou da URL.

## Origens disponíveis
`formulario`, `paid_traffic`, `meta_ads`, `facebook_ads`, `instagram_ads`, `google_ads`, `tiktok_ads`, `instagram`, `instagram_direct`, `facebook`, `facebook_messenger`, `tiktok`, `google_business_profile`, `whatsapp`, `referral`, `own_prospecting` e `other`.

## Compatibilidade e tracking
Formulários antigos recebem o fallback `formulario`. Alterar `forms.lead_source` somente afeta leads criados depois da alteração; leads existentes não são atualizados. `public_form` continua sendo a origem técnica do evento de tracking, enquanto `leads.source` é a origem comercial.

## Deploy e repair
Aplique a migration `20260717160000_add_form_lead_source` com `npx prisma migrate deploy`. Para bancos legados, execute `npm run repair:production-schema`; ele adiciona a coluna, faz backfill, aplica default/NOT NULL e cria os índices necessários de forma idempotente.

## Validação no Neon
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'forms' AND column_name = 'lead_source';

SELECT lead_source, COUNT(*) AS quantidade
FROM public.forms
GROUP BY lead_source
ORDER BY quantidade DESC;
```

## Teste manual
1. Crie ou edite um formulário e selecione **Direct do Instagram**.
2. Envie uma submissão pública e confirme `forms.lead_source = 'instagram_direct'` e o novo `leads.source = 'instagram_direct'`.
3. Mude o formulário para **Facebook Ads**, envie outro lead e confirme que apenas o novo lead usa `facebook_ads`.
4. Envie `source` ou `leadSource` no corpo da submissão e confirme que a origem persistida do formulário prevalece.

## Rollback seguro
Reverta o código primeiro, mantendo a coluna e os índices para preservar dados. Caso seja indispensável remover o schema posteriormente, faça backup e confirme que nenhuma versão em execução depende de `lead_source` antes de remover a coluna e o índice.
