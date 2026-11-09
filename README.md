# Amenduin Competitive System (ACS) — MVP + Supabase scaffold

## O que já funciona no navegador
- Navegação: Visão geral, Jogadores, Rankings, Equipes e Mercado.
- Cadastro e edição de perfis.
- Pesquisa, filtro por função e ordenação.
- Página detalhada do jogador.
- Ranking demonstrativo.
- Salvamento local em `localStorage`.
- Layout responsivo.

## Preparação para autenticação e banco online
O projeto inclui:
- `supabase-config.js`: local para inserir URL e chave publicável do Supabase.
- `supabase-schema.sql`: tabelas iniciais, índices e políticas RLS.
- Fluxo de login/cadastro por e-mail e senha.
- Leitura e gravação básica de perfis online após autenticação.

### Como ativar Supabase
1. Crie um projeto gratuito em https://supabase.com/.
2. No painel do projeto, abra **SQL Editor** e execute todo o conteúdo de `supabase-schema.sql`.
3. Em **Project Settings → API**, copie o Project URL e a chave **publishable** (ou anon legacy).
4. Cole os valores em `supabase-config.js`:
   ```js
   window.ACS_SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
   window.ACS_SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICAVEL";
   ```
5. Publique o site em um host estático HTTPS, por exemplo Cloudflare Pages ou GitHub Pages.
6. Em Supabase → Authentication → URL Configuration, configure a URL do site publicado como Site URL e adicione-a às Redirect URLs.
7. Teste criar conta, confirmar e-mail (se habilitado), entrar e criar perfil.

## Segurança e limites desta etapa
- Nunca coloque a chave `service_role` no frontend.
- O SQL permite que qualquer visitante veja perfis e dados públicos da liga.
- Um usuário autenticado só pode inserir/editar o próprio perfil (associado a `auth.uid()`).
- Não há permissões administrativas completas ainda. Estatísticas oficiais, avaliações, partidas, equipes e decisões de transferência não podem ser gravadas pelo frontend nesta versão.
- O app ainda mantém os perfis de demonstração no navegador para fins de visualização.
- A sincronização online básica ainda precisa ser testada no seu projeto Supabase e pode exigir pequenos ajustes conforme as configurações de autenticação.

## Próxima etapa recomendada
Implementar painel administrativo seguro com papéis de organizador e administrador, cadastro de campeonatos/partidas e registro de estatísticas oficiais. O provisionamento desses papéis deve ocorrer por ambiente confiável, não pelo próprio usuário.

## ACS 3.0 — Mercado de jogadores

A versão 3 adiciona consulta pública dos perfis sincronizados e propostas de transferência entre jogadores. Para ativar o Mercado, abra `acs-3.0-market-migration.sql`, copie todo o conteúdo e execute uma vez no SQL Editor do Supabase. Esse arquivo é uma migração separada; não é necessário executar novamente o `supabase-schema.sql` original.

Como funciona:
- O jogador precisa ter uma conta autenticada e um perfil ACS vinculado a essa conta.
- O perfil pode ser marcado como `Disponível`, `Negociável` ou `Livre` para aparecer no Mercado.
- O jogador que envia a proposta escolhe um perfil da própria conta e escreve uma mensagem.
- Apenas o dono do perfil destinatário pode aceitar ou recusar. O autor pode cancelar a própria proposta.
- Ao aceitar, se o jogador proponente estiver vinculado a uma equipe diferente de `Sem equipe`, o perfil destinatário passa para essa equipe e o sistema registra a movimentação na tabela `transfers`.

Importante: após atualizar os arquivos no GitHub, aguarde o GitHub Pages publicar a nova versão. Não altere nem publique a chave `service_role`; o frontend usa somente a Publishable/anon key.


### Atualização do site publicado

1. Extraia este ZIP no computador.
2. No repositório do GitHub, substitua os arquivos antigos pelos arquivos desta pasta (incluindo `index.html`, `app.js`, `styles.css` e `supabase-config.js`).
3. Faça o commit das alterações. O GitHub Pages publicará a atualização automaticamente.
4. No Supabase, execute `acs-3.0-market-migration.sql` uma única vez.
5. Abra o site, entre com uma conta que tenha perfil de jogador e teste o Mercado com uma segunda conta.

O código foi validado quanto à sintaxe JavaScript (`node --check`) e à estrutura HTML. A integração real depende da execução da migração e de testes no projeto Supabase do organizador.

## ACS 3.1 — equipes e convites

A versão 3.1 adiciona criação de equipes por qualquer jogador com perfil vinculado, convites para outros jogadores, aceite/recusa de convites, lista pública de elencos e remoção de integrantes pelo capitão.

### Atualização do Supabase
1. Abra o projeto no Supabase e entre em **SQL Editor**.
2. Crie uma nova query e cole o conteúdo de `acs-3.1-teams-migration.sql`.
3. Execute uma vez. Não execute novamente o schema inicial nem as migrations anteriores.
4. Preserve seu `supabase-config.js` atual, com a URL e a chave pública do seu projeto.

### Como usar
- Entre na sua conta e crie/vincule seu perfil de jogador.
- Abra **Equipes** e crie uma equipe. O criador vira capitão.
- O capitão seleciona um jogador sem equipe no seletor do elenco e envia um convite.
- O convidado entra em **Equipes > Convites recebidos** e aceita ou recusa.
- O aceite adiciona o jogador ao elenco e atualiza a equipe exibida no perfil.
- O capitão pode remover integrantes. O capitão não pode remover a si mesmo.

A capacidade da equipe é escolhida na criação (3, 5 ou 6). Um jogador só pode estar em uma equipe por vez. Ações de equipe são validadas no banco por funções RPC com `SECURITY DEFINER`; as tabelas não permitem escrita direta pelo navegador.
