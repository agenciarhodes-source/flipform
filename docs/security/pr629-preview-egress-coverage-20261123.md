# PR629 — proteção adicional dos transportes de saída no preview (23/11/2026)

**Escopo:** branch protegida `security/api-v1-homologation-20261121` do projeto de staging Vercel, com `PR629_BLOCK_EXTERNAL_EGRESS=true`. A função central `assertPr629NoExternalEgress` **só nega chamadas quando `VERCEL_ENV=preview` e a flag está ativada**, nunca por configuração automática em produção. Esta é uma barreira de aplicação, não uma regra de firewall.

## Endpoints adicionais protegidos

- `lib/meta/instagram-private-reply.ts`: envio de resposta privada à Meta; trava antes do `fetch`.
- `lib/meta/whatsapp-templates.ts`: helper compartilhado de chamadas de template (listagem, criação e exclusão); trava antes do `fetch`.
- `lib/meta/whatsapp-media.ts`: trava antes do download de metadados/arquivo e antes do upload de arquivos de mídia; nenhum dado de cliente é usado nos testes.
- `lib/meta/whatsapp-typing.ts`: trava antes de informar digitação/leitura ao WhatsApp.

Cobertura anterior mantida: transportes conhecidos de Meta CAPI, Google Data Manager, Instagram outbound, WhatsApp outbound, Stripe SDK e e-mail/SMTP/Resend, todos somente no preview com opt-in.

**Limitação material:** Meta OAuth, perfil Graph, SDKs e infraestrutura de terceiros que não passam por esses módulos, GTM cliente, cron/webhooks, instrumentação e eventuais caminhos indiretos podem seguir fazendo requisições externas. Não afirmar egress universal. Campanhas Ads, Pixel, credenciais Meta/Google e produção não foram alterados.

Testes adicionais em `tests/test_pr629_extra_preview_transports_guard.py` verificam a existência de cada trava no início da função de transporte, antes do seu primeiro `fetch`, com flag restrita ao preview. Testes são estáticos, **não captura de tráfego real**.

**Regra de publicação:** aceite do proprietário pela coordenação operacional está documentado, mas gate `staging_egress_isolation_attested=false` e `production_release_authorized=false` não foram modificados; a revisão LGPD das dez categorias continua pendente.
