# PR 00 / PR #623 — production-maintenance Environment: configuração segura

**Status atualizado em 18/11/2026:** ambiente GitHub `production-maintenance` **criado manualmente pelo responsável** e comprovado por capturas da interface; restrição à `main` e `MAINTENANCE_GATE=disabled` confirmadas. Quatro workflows legados de reparo aparecem desativados. Não há secrets exclusivos registrados nas capturas e a aprovação obrigatória de revisores não foi comprovada. O PR #623 continua Draft. Ver `docs/security/pr00-a2b-recovery-evidence-and-acceptance-20261118.md`. Nenhum workflow de reparo foi executado. Não mesclar ou fazer deploy por causa deste documento.

## Limites e plano GitHub

- Repositório privado `agenciarhodes-source/flipform`.
- Environments e environment secrets em repositórios privados exigem plano GitHub Pro, Team ou Enterprise. Em repositórios privados, **required reviewers não estão disponíveis nos planos Free, Pro e Team** (consultar documentação do GitHub para o plano atual).
- Não confundir o ambiente com o bloco YAML `environment: production-maintenance`: o nome por si só não garante regras de aprovação; sem configuração explícita pode existir um ambiente sem proteção.
- **NÃO disparar workflows para tentar criar o environment.** Não executar nenhum workflow `repair-*` como teste de configuração.

## Passo administrativo de criação (somente por administrador autorizado)

1. **JÁ REALIZADO:** GitHub → repositório → **Settings → Environments**; ambiente `production-maintenance` criado manualmente. Não recriar o ambiente.
2. **JÁ REALIZADO:** **Deployment branches and tags** restrita à `main`, sem tags; não voltar a "No restriction". Se disponível em plano/conta, configurar revisão humana obrigatória e `prevent self-review`. Em plano onde isso não existe para repo privado, o gate de aprovação humana continua **NÃO HOMOLOGADO** e requer procedimento externo de duas pessoas, com registro de autorização antes de cada operação; não declarar equivalente técnico a review obrigatório.
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

## Protocolo de responsável único — modo seguro por padrão (18/11/2026)

**Contexto real:** há somente um responsável pelo sistema. Não existe segundo aprovador humano independente registrado. A interface GitHub privada mostrada não disponibiliza Required reviewers para este Environment. **Não denominar este fluxo como dupla aprovação, revisão independente, four-eyes ou homologação de acesso administrativo.**

### Regra operacional vigente — manutenção BLOQUEADA

- `MAINTENANCE_GATE=disabled` no Environment `production-maintenance`; manter exatamente assim.
- Manter os quatro workflows antigos `Repair Production Schema`, `Repair Business Group Schema`, `Repair Team Hierarchy Schema` e `Repair WhatsApp Cloud Schema` **Disabled** na interface Actions; não reativar para testar setup.
- **Não cadastrar** `PR00_MAINTENANCE_DATABASE_URL` nem `PR00_MAINTENANCE_DIRECT_URL` enquanto não houver um evento de manutenção efetivamente aprovado. Não copiar senhas ou DSNs de Vercel/Neon para tickets, arquivos, comentários, chat ou logs.
- Ambiente restringido a `main` sem tags e variáveis não sigilosas de identidade cadastradas. `MAINTENANCE_DB_USER=neondb_owner` é somente inventário e não aprovação do uso de uma role proprietária.
- PR #623 permanece **Draft**, sem merge nem deploy. PRs de laboratório continuam separados. Nenhum reparo de produção está autorizado.

### Operação normal enquanto houver um responsável

1. Trabalhar em PRs Draft com GitHub CI/Playwright usando **somente banco local descartável** e fixtures sintéticas.
2. Permitir diagnósticos **somente leitura** em fontes explicitamente autorizadas; não rodar SQL produtivo de reparo, não executar workflows desabilitados.
3. Registrar ticket/PR com propósito, risco, arquivos, teste offline, efeito esperado, plano de rollback e evidência de não regressão; o próprio autor não conta como revisor independente.
4. Separar o aceite técnico de PR00 (auditoria/risco/documentação) da eventual ativação de reparos produtivos. Não considerar um novo PR automaticamente seguro por este protocolo; gates G1–G8 e bloqueios do Plano Mestre v6.1 seguem válidos.
5. Manter um registro de decisões e de risco aceito pelo proprietário para **adiar a capacidade de manutenção**, sem alegar que se atingiu a proteção humana exigida para habilitá-la.

### Se houver uma manutenção produtiva indispensável

**Não há autorização permanente nem autoaprovação para execução.** A situação deverá ser reavaliada caso a caso, com as seguintes condições **antes de habilitar qualquer mecanismo**:

1. Incidente ou necessidade comprovada, criticidade e escopo exatos; SQL/comando revisado, alternativas não destrutivas analisadas e janela definida.
2. Obter, preferencialmente, revisão humana externa de profissional habilitado ou suporte contratado. Caso não seja possível, registrar expressamente **ausência de aprovação independente e risco residual**; isso não converte autoaprovação em segunda autorização.
3. Confirmar banco/branch/role reais e privilégios mínimos necessários; evitar role proprietária se a operação permitir. Validar separadamente destino de runtime e conexão direta, sem exibir credenciais.
4. Evidência recente de snapshot/backup do destino, restauração ensaiada em banco descartável, e passo a passo de rollback; RPO/RTO definidos e medidos ou lacunas assumidas explicitamente.
5. Propor autorização **nova, individual, escrita e limitada** para mudar o gate, provisionar secrets exclusivos no escopo do Environment, reativar workflow, executar a ação específica e retornar tudo ao estado bloqueado. Autorização para planejar/alterar código do PR00 **não autoriza** estas ações.
6. Registrar execução e resultado sem PII nem secrets. Após a janela, revogar/rotacionar credenciais de manutenção se provisionadas, desabilitar workflows e repor `MAINTENANCE_GATE=disabled`; conferir estado final com evidências.
7. Se algum requisito indispensável não estiver comprovado, **não executar**. Escalonar ao suporte técnico apropriado para recuperação de incidentes.

### Critérios de aceite nesta etapa

- **Aceite possível agora:** isolamento procedural por padrão, repositório com workflows desativados, gate desabilitado, branch restriction, testes de guarda CI, e descrição verificável das pendências.
- **Aceite NÃO possível agora:** dupla aprovação, acessos de reparo a produção, segredos exclusivos verificados, teste de restore produtivo ou recuperação da aplicação ponta a ponta, ou liberação do PR #623 para merge somente por haver CI verde.
- Não confundir viabilidade de **preparar/planejar PR01** com liberação para **implementar, migrar, fazer merge ou deployar PR01**: esses marcos dependem de aceite posterior dos gates aplicáveis, sem alterar as restrições do Plano Mestre v6.1.

## Gate de aceite

**BLOQUEADO até:** (a) o Environment existir e ter branch policy confirmada; (b) secrets exclusivos por environment e vars consistentes; (c) aprovação humana viável efetiva e operacionalmente documentada; (d) backup/restauração testados no escopo aprovado; (e) testes de regressão e revisão independente; (f) autorização explícita para merge e, separadamente, autorização por execução de reparo.

**Não incluir nestas permissões:** deploy em produção, alteração de `main`, execução de SQL/DDL/DML, mudança de Pixel/Meta/Google, WhatsApp, Stripe, ou acesso a dados de clientes.

Referências: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments e https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
