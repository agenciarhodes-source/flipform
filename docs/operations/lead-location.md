# Localização do lead (Cidade/Estado)

## Como funciona
- O Form Builder oferece o tipo `Cidade/Estado` (`city_state`).
- No formulário público, o lead seleciona primeiro o Estado (UF) e depois uma Cidade da lista fixa versionada no repositório.
- A resposta do formulário é estruturada: `{ "state": "MA", "stateName": "Maranhão", "city": "São Luís" }`.
- O lead também recebe os campos normalizados `state` e `city` para filtros e relatórios.

## Edição manual
- Na criação manual de lead, Estado e Cidade são opcionais.
- No detalhe do lead, aba **Dados**, o bloco **Localização** permite ajustar Estado/Cidade pelo endpoint `PATCH /api/leads/[id]/location`.
- Se a Cidade for informada, ela precisa pertencer ao Estado selecionado.

## Dashboard
- O Dashboard prioriza `lead.state` e `lead.city`.
- Para compatibilidade com leads antigos, ele ainda usa resposta estruturada do campo `Cidade/Estado` e fallback por labels contendo cidade/estado/UF.
- Filtros, métricas, mapa simples por UF e ranking de cidades usam essa localização normalizada/fallback.

## Migration e repair
A migration adiciona `state` e `city` opcionais na tabela `leads` e índices por tenant/UF/cidade.
Em produção, aplique migrations normalmente ou rode:

```bash
npm run repair:production-schema
```

O readiness administrativo verifica `leads.state` e `leads.city` e orienta rodar migration ou repair caso faltem.

## LGPD
Este recurso não coleta localização automática por IP, não usa geolocalização do navegador, não pede permissão de localização e não armazena coordenadas pessoais.
