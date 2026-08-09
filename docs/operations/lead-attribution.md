# Lead attribution

## Objetivo

`LeadAttribution` preserva o snapshot de aquisição de cada lead criado por formulário público. A origem comercial configurada no formulário (`Lead.source`) continua independente dessa metadata.

## Campos

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`: parâmetros UTM da URL de entrada.
- `fbclid` e `gclid`: identificadores de clique recebidos na URL, sem conversão ou enriquecimento.
- `fbc` e `fbp`: valores dos cookies Meta `_fbc` e `_fbp`, somente quando já existem.
- `landing_page`: URL real do formulário, com domínio e query string, limitada a 2.048 caracteres.
- `referrer`: `document.referrer`, quando disponível.
- `client_ip`: IP derivado pelo backend dos headers de infraestrutura conhecidos.
- `client_user_agent`: User-Agent derivado pelo backend.

## Fluxo

```text
URL → PublicFormView → submit API → Lead → LeadAttribution
```

O lead, suas respostas e o histórico inicial são criados primeiro, na transação crítica existente. Depois, a API tenta criar um único registro de atribuição. Leads manuais e visitantes desqualificados não recebem registros artificiais.

## Segurança

- O tenant é sempre `form.tenantId`, resolvido no servidor; o payload não aceita `tenantId` nem `leadId`.
- IP e User-Agent vêm do request no servidor, nunca do corpo público.
- Somente `_fbc` e `_fbp` são extraídos do header de cookies; o header completo não é armazenado e valores ausentes não são inventados.
- O payload tem campos explícitos, é estrito e aplica limites. Não são armazenados headers ou payloads brutos.
- Uma falha de persistência de attribution gera somente um log técnico sanitizado e não desfaz nem invalida o lead.

## Banco / Neon

A migration `20260809120000_add_lead_attribution` cria `lead_attributions`, a unicidade 1:1 de `lead_id`, chaves estrangeiras com cascade e índices multi-tenant. Não há backfill. O repair de produção oferece SQL idempotente para bases legadas. A migration precisa ser aplicada separadamente com o processo operacional aprovado (por exemplo, `npx prisma migrate deploy`) e confirmada por `npm run admin:diagnose-schema`; a presença do arquivo não significa que o Neon foi alterado.

## Teste manual

Abra uma URL no domínio de plataforma ou em um custom domain válido:

```text
https://app.flipform.com.br/f/SLUG?utm_source=meta&utm_medium=paid_social&utm_campaign=teste_attribution&utm_content=criativo_a&utm_term=aposentadoria&fbclid=TESTE123
```

Envie um formulário qualificado e confirme o lead, answers, history e o registro 1:1 em `lead_attributions`. Repita sem query string e confirme que a submissão continua funcionando. Para resiliência, simule indisponibilidade apenas da tabela de atribuição em ambiente isolado e confirme que a resposta ainda indica sucesso e o lead permanece salvo.
