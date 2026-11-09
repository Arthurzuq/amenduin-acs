# Amenduin ACS 3.3 — Administração

Atualização incremental para o ACS 3.2. Inclui exclusão de equipes pelo capitão, remoção dos perfis demonstrativos locais, painel administrativo e estatísticas oficiais protegidas no Supabase.

## Arquivos
- `index.html`, `styles.css`, `app.js`: frontend atualizado.
- `acs-3.3-admin-migration.sql`: migração incremental do banco.
- `supabase-config.js`: mantenha o arquivo do seu projeto, com a Project URL e a publishable/anon key atuais.

## Instalação
1. Faça backup/export do projeto Supabase antes da migração.
2. No Supabase, abra SQL Editor e execute `acs-3.3-admin-migration.sql` uma única vez. Ela pressupõe que as migrations ACS 3.0, 3.1 e 3.2 já foram aplicadas.
3. Extraia este ZIP e envie os arquivos da pasta `amenduin_acs` ao repositório GitHub, substituindo os arquivos antigos.
4. **Não substitua `supabase-config.js`** pelo arquivo de exemplo do ZIP se ele estiver preenchido no seu site. Preserve a URL e a chave pública do seu projeto.
5. Aguarde o GitHub Pages publicar e atualize o site com Ctrl+F5.
6. Entre na conta que será a administradora, abra Administração e informe o código de ativação abaixo.

## Código de ativação inicial
O código de cinco dígitos foi fornecido separadamente na conversa, não neste arquivo. Ele é de uso único para o projeto Supabase. A migração armazena somente um hash com salt, invalida o código após o primeiro uso e bloqueia novas tentativas por 24 horas depois de cinco erros. Ative-o somente depois de entrar na conta correta. Não publique o código em repositórios, mensagens ou prints.

**Limite de segurança:** um PIN de cinco dígitos é uma credencial fraca. O fluxo foi limitado a uso único e tentativas globais, mas o painel administrativo também depende da autenticação por e-mail/senha do Supabase. Para uma operação de alto risco, substitua o PIN por provisionamento administrativo fora do frontend e autenticação forte.

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
