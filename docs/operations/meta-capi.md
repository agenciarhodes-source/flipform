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
- Pixel browser, deduplicação por `event_id`, outbox, filas e retries permanecem fora de escopo.
