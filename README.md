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
