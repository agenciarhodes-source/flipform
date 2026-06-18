# Domínios personalizados de formulários

A configuração de domínios personalizados é gerenciada pelo backoffice nesta fase. O cliente apenas solicita o domínio principal; o sistema cria a solicitação para o subdomínio obrigatório `leads` e não chama a API da Vercel automaticamente.

## Fluxo operacional

1. Cliente acessa **Domínios** e informa o domínio principal, por exemplo `cliente.com.br`.
2. FlipForm gera a solicitação para `leads.cliente.com.br` com status inicial `requested`.
3. Backoffice acessa a Vercel e adiciona o domínio ao projeto correto.
4. Backoffice copia o CNAME recomendado pela Vercel.
5. Backoffice acessa **Admin > Domínios** no FlipForm e atualiza o domínio com `dnsTarget`, `verificationType`, `verificationDomain`, `verificationValue`, `verificationReason`, `status`, `verificationStatus` e `sslStatus`.
6. Cliente passa a ver a instrução DNS somente quando `dnsTarget` ou `verificationValue` estiver preenchido.
7. Cliente cria o CNAME na Cloudflare com host `leads`, TTL `Auto` e proxy `DNS only`.
8. Backoffice verifica DNS/SSL na Vercel ou no provedor operacional definido.
9. Quando DNS e SSL estiverem corretos, backoffice marca o domínio como `active`, `verificationStatus=verified`, `sslStatus=active` e, se desejado, como principal.

## Regras importantes

- Não criar domínios reais automaticamente pelo cliente.
- Não inserir domínios reais no banco fora da solicitação feita pelo cliente.
- Não exibir `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` ou `VERCEL_TEAM_ID` para clientes.
- Não exibir `cname.vercel-dns.com` como fallback para clientes.
- Apenas um domínio principal pode existir por tenant; ao marcar um domínio como principal, os demais são desmarcados.
- Links públicos usam `app.flipform.com.br/f/{slug}` enquanto o domínio personalizado não estiver ativo.
- Links públicos usam `https://leads.dominio.com.br/{slug}` somente quando status, verificação e SSL estiverem ativos.
