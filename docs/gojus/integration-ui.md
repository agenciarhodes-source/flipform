# Integrações → GoJus

O card com logotipo abre um modal com URL de acesso, e-mail e senha, seguindo a referência fornecida. Somente o perfil Desenvolvedor com concessão ativa gojus_robot da empresa selecionada pode ver o card. Não se trata de integração via API do GoJus.

Esta etapa é exclusivamente de organização visual: campos e botões de teste e salvamento desativados, sem receber dados, sem novo endpoint, sem persistência, sem conexão simulada e sem alteração de schema. O estado é Desconectado. Não alterar conexões existentes nem liberar grant.

Etapa posterior: armazenamento segregado por empresa com criptografia e auditoria sem segredos; validar origem HTTPS exata previamente autorizada, impedir SSRF e redirecionamento para origem não autorizada; worker Playwright com conta autorizada e isolamento de sessão, teste apenas de login; não confundir com senha pessoal gov.br de cliente. Ativar somente após aprovação e homologação.