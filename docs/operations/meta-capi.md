# Meta Conversions API: `user_data`

## Fontes server-side

O tracking consulta o lead por `tenantId` **e** `leadId` e carrega, em uma única consulta, o `Lead` e a relação opcional `LeadAttribution`. Um lead antigo sem attribution continua elegível com os identificadores que possuir.

| Campo Meta | Fonte | Tratamento |
| --- | --- | --- |
| `em` | `Lead.email` | trim, lowercase, normalização Unicode e SHA-256 |
| `ph` | `Lead.phone` | somente dígitos e SHA-256 |
| `fn` / `ln` | `Lead.name` | primeira palavra / restante; trim, lowercase, normalização Unicode e SHA-256 |
| `ct` | `Lead.city` | trim, lowercase, remoção determinística de diacríticos, espaços e pontuação, e SHA-256 |
| `st` | `Lead.state` | trim, lowercase, normalização Unicode e SHA-256; a UF não é expandida |
| `external_id` | `${tenantId}:${leadId}` | SHA-256; estável e isolado por tenant |
| `fbc` / `fbp` | `LeadAttribution.fbc` / `.fbp` | texto original, sem hash; nunca sintetizado |
| `client_ip_address` | `LeadAttribution.clientIp` | sem hash |
| `client_user_agent` | `LeadAttribution.clientUserAgent` | sem hash |
| `event_source_url` | `LeadAttribution.landingPage` | somente eventos `public_form` (`action_source: website`) |

Valores nulos, vazios, `undefined` e arrays vazios são omitidos. Eventos Kanban permanecem `system_generated` e não declaram a landing page histórica como local da conversão comercial.

## Segurança e operação

- O payload avançado não é aceito do request público; IP, User-Agent e cookies Meta vêm da attribution persistida no servidor.
- Falhas da Meta continuam registradas como `failed` sem desfazer a submissão ou a operação do CRM.
- A Graph API permanece em `v19.0`; atualizar a versão exige validação separada contra a documentação vigente.
- Este incremento não exige migration Neon e não altera dados existentes.
- Outbox, filas e retries permanecem fora de escopo.

## Browser Event

Depois que a API confirma a criação de um Lead qualificado, o formulário carrega o Meta Pixel sob demanda e envia somente o Standard Event `Lead`. Não há `PageView` nem envio manual de PII pelo navegador.

## Server Event

A mesma submissão envia o evento `Lead` pela CAPI. A falha da CAPI é registrada no `TrackingEventLog`, mas não desfaz o Lead nem transforma a resposta pública em erro.

## Deduplication

As versões browser e server usam o mesmo nome (`Lead`) e o mesmo identificador: `eventID` no Pixel e `event_id` na CAPI. Outros eventos, incluindo `QualifiedLead` e `Purchase`, recebem IDs novos e independentes.

## Event ID owner

O servidor cria um UUID somente depois da criação bem-sucedida do Lead. O browser não fornece nem escolhe esse valor.

## Pixel ID

O Pixel ID é configuração pública, numérica e validada. Ele é obtido exclusivamente das configurações do tenant ao qual o formulário resolvido pertence; valores do request público são ignorados.

## Access Token

O Access Token e o Test Event Code continuam sendo segredos server-only. A consulta destinada à resposta pública seleciona explicitamente apenas `metaPixelEnabled` e `metaPixelId`, e a resposta expõe somente `pixelId` e `eventId`.

## Failure behavior

O Pixel é best-effort: bloqueio do script, ad blocker ou falha de `fbq` não afetam a tela de sucesso. Uma configuração parcial com Pixel habilitado e ID válido ainda pode disparar o browser event mesmo que a CAPI esteja sem token; detalhes da configuração não são exibidos ao visitante.

## Custom Domains

O helper usa a URL atual do formulário e não depende de um hostname FlipForm. Assim, `/f/[slug]`, `/custom-domain/[slug]` e a resolução por domínio próprio compartilham o mesmo fluxo.

## Preview

O preview do builder não executa o callback de submissão e, portanto, não cria Lead, não chama CAPI, não carrega o Pixel e não dispara `fbq`.

Este PR não requer migration Neon.
