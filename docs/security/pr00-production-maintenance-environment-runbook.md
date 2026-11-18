# PR 00 / PR #623 — production-maintenance Environment: configuração segura

**Status:** instruções e bloqueios preparados em Draft; **o ambiente GitHub não foi criado/configurado automaticamente**. Nenhum workflow de reparo foi executado. Não mesclar ou fazer deploy por causa deste documento.

## Limites e plano GitHub

- Repositório privado `agenciarhodes-source/flipform`.
- Environments e environment secrets em repositórios privados exigem plano GitHub Pro, Team ou Enterprise. Em repositórios privados, **required reviewers não estão disponíveis nos planos Free, Pro e Team** (consultar documentação do GitHub para o plano atual).
- Não confundir o ambiente com o bloco YAML `environment: production-maintenance`: o nome por si só não garante regras de aprovação; sem configuração explícita pode existir um ambiente sem proteção.
- **NÃO disparar workflows para tentar criar o environment.** Não executar nenhum workflow `repair-*` como teste de configuração.

## Passo administrativo de criação (somente por administrador autorizado)

1. GitHub → repositório → **Settings → Environments → New environment**, nome exato: `production-maintenance`.
2. Restringir **Deployment branches and tags** à branch `main`; não usar "No restriction". Se disponível em plano/conta, configurar revisão humana obrigatória e `prevent self-review`. Em plano onde isso não existe para repo privado, o gate de aprovação humana continua **NÃO HOMOLOGADO** e requer procedimento externo de duas pessoas, com registro de autorização antes de cada operação; não declarar equivalente técnico a review obrigatório.
3. Em **Environment secrets** (e somente ali), cadastrar nomes novos abaixo, **sem informar valores neste chat, no diff, PR ou logs**:
   - `PR00_MAINTENANCE_DATABASE_URL`: endpoint de runtime/pooled autorizado para o banco PROD real de manutenção.
   - `PR00_MAINTENANCE_DIRECT_URL`: endpoint direto autorizado ao mesmo projeto/banco/role, usando TLS.
   Não usar `DATABASE_URL` e `DIRECT_URL` genéricos do repositório, nem copiar credenciais do staging.
4. Em **Environment variables** (não secrets), configurar nomes:
   - `MAINTENANCE_DB_HOST`: host do banco runtime/pooled, sem esquema `postgres://` e sem porta/senha.
   - `MAINTENANCE_DIRECT_HOST`: host de conexão direta.
   - `MAINTENANCE_DB_NAME`: nome esperado do banco de produção.
   - `MAINTENANCE_DB_USER`: role mínima necessária, aprovada pela operação.
   - `MAINTENANCE_GATE`: **`disabled`** inicialmente. NÃO habilitar enquanto aprovação independente, backup e plano de retorno não estiverem comprovados.
   Mesmo nomes também devem ser auditados em Repository Variables/Secrets e Organization Variables/Secrets para evitar cópias fora do environment.
5. Confirmar por capturas redigidas apenas a existência das proteções e os nomes de variáveis/segredos — nunca mostrar os valores de credenciais.

## O que o PR #623 garante pelo código

- Disparo manual somente na `main`; confirmação literal `REPAIR <ação>` específica.
- Ambiente `production-maintenance` associado ao job; `contents: read`, concorrência serializada.
- `MAINTENANCE_GATE=enabled` obrigatório.
- Antes do primeiro SQL, preflight valida presença, TLS, host, nome do banco e role das duas URLs.
- Workflows referenciam somente os secrets prefixados `PR00_MAINTENANCE_...`. **Se esses secrets ou as vars não estiverem presentes, o job falha fechado.**
- Testes offline verificam o preflight; **não demonstram** controle da UI GitHub, permissões do provedor Neon, backup recuperável ou aprovação independente.

## Backup, autorização e rollback (bloqueadores adicionais)

1. Responsáveis operacionais e técnicos registrados, autorização documentada por operação e revisão do SQL específico.
2. Verificar mecanismo de snapshot/backup **do projeto real de produção**, retenção, checksum e possibilidade de restore; snapshots do Neon de staging NÃO provam recuperação de produção.
3. Executar exercício de restore apenas com banco descartável e dados sintéticos após autorização separada. Medir RPO/RTO.
4. Não executar `pg_restore --clean` nem scripts de reparo até haver validação do destino, backup, janela e procedimento de retorno.
5. O pré-voo de conexões e a confirmação literal no workflow **não provam** que o snapshot existe ou que foi testado.

## Gate de aceite

**BLOQUEADO até:** (a) o Environment existir e ter branch policy confirmada; (b) secrets exclusivos por environment e vars consistentes; (c) aprovação humana viável efetiva e operacionalmente documentada; (d) backup/restauração testados no escopo aprovado; (e) testes de regressão e revisão independente; (f) autorização explícita para merge e, separadamente, autorização por execução de reparo.

**Não incluir nestas permissões:** deploy em produção, alteração de `main`, execução de SQL/DDL/DML, mudança de Pixel/Meta/Google, WhatsApp, Stripe, ou acesso a dados de clientes.

Referências: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments e https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
