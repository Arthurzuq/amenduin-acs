# Amenduin ACS 3.3.1 — Correção do acesso administrativo

Correção incremental da ACS 3.3. Corrige o acesso à tela de ativação do administrador: o link Administração agora aparece para qualquer usuário autenticado, permitindo inserir o PIN de ativação. Também corrige o registro de auditoria para gravar INSERT/UPDATE em minúsculas, conforme a restrição da tabela.

## Arquivos
- `index.html`, `styles.css`, `app.js`: frontend atualizado.
- `acs-3.3-admin-migration.sql`: migração incremental do banco.
- `supabase-config.js`: mantenha o arquivo do seu projeto, com a Project URL e a publishable/anon key atuais.

## Instalação
1. Faça backup/export do projeto Supabase antes da migração.
2. No Supabase, abra SQL Editor e execute `acs-3.3-admin-migration.sql` uma única vez. Ela pressupõe que as migrations ACS 3.0, 3.1 e 3.2 já foram aplicadas.
3. Extraia este ZIP. **Abra a pasta `amenduin_acs` e envie o CONTEÚDO dela para a raiz do repositório GitHub**, substituindo `index.html`, `app.js`, `styles.css` e os SQLs. O resultado correto é `index.html` diretamente na raiz do repositório, e não `amenduin_acs/index.html`.
4. **Não substitua `supabase-config.js`** pelo arquivo de exemplo do ZIP se ele estiver preenchido no seu site. Preserve a URL e a chave pública do seu projeto.
5. Aguarde o GitHub Pages publicar e atualize o site com Ctrl+F5.
6. Entre na conta que será a administradora. O link **Administração** deve aparecer na barra lateral para qualquer usuário logado. Abra-o e informe o código de ativação fornecido na conversa.

## Código de ativação inicial
O código de cinco dígitos foi fornecido separadamente na conversa, não neste arquivo. Ele é de uso único para o projeto Supabase. A migração armazena somente um hash com salt, invalida o código após o primeiro uso e bloqueia novas tentativas por 24 horas depois de cinco erros. Ative-o somente depois de entrar na conta correta. Não publique o código em repositórios, mensagens ou prints.

**Limite de segurança:** um PIN de cinco dígitos é uma credencial fraca. O fluxo foi limitado a uso único e tentativas globais, mas o painel administrativo também depende da autenticação por e-mail/senha do Supabase. Para uma operação de alto risco, substitua o PIN por provisionamento administrativo fora do frontend e autenticação forte.

## Correções da 3.3.1
- O link Administração estava oculto para usuários que ainda não eram administradores, impedindo que a primeira conta pudesse inserir o código. Agora aparece para qualquer usuário autenticado; o banco continua exigindo o PIN de uso único para conceder o papel de administrador.
- O gatilho de auditoria agora grava `insert`/`update` em minúsculas, de acordo com a restrição da tabela.

## O que muda
- Perfis fictícios `demo-*` são removidos do armazenamento local deste navegador e deixam de ser incluídos na listagem.
- Jogadores reais cadastrados no Supabase continuam preservados.
- O capitão pode excluir a própria equipe. Todos os integrantes retornam a `Sem equipe`; os convites e a equipe são removidos.
- Apenas a conta com papel `admin` pode gravar estatísticas oficiais, por meio de função SQL protegida. Jogadores comuns não recebem permissão direta de escrita na tabela de estatísticas.
- O painel permite editar Rating AM, K/D, ADR, HS%, Win Rate, partidas, MVPs, kills, deaths, first kills, first deaths e clutches.
- Cada alteração nas estatísticas gera um registro de auditoria no banco.

## Observações
- Os perfis demonstrativos eram dados locais do frontend; a migração não apaga contas nem perfis reais do banco.
- A atualização não cria partidas automaticamente nem calcula estatísticas a partir de placares. O administrador registra os agregados atuais no painel.
- Não coloque a `service_role` key no frontend. Use apenas a publishable/anon key.
- A integração precisa ser validada no projeto Supabase real após a migração.
