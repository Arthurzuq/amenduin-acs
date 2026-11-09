# Amenduin ACS 4.0 — Partidas e estatísticas oficiais

Atualização incremental sobre a ACS 3.3.1. Adiciona registro administrativo de partidas, histórico público e recálculo automático das estatísticas competitivas a partir dos confrontos concluídos.

## O que entra nesta versão

- Nova página **Partidas** com placares, mapa, formato, data, jogadores participantes e K/D/A individual.
- Formulário de registro visível somente para administradores autenticados e reconhecidos pelo banco (`acs_is_admin`).
- Registro transacional via RPC protegida `acs_admin_record_match`: cria a partida e suas linhas individuais em uma única operação.
- Exclusão administrativa de partida via `acs_admin_delete_match`; os agregados dos jogadores são recalculados após a exclusão.
- Recálculo de partidas, kills, deaths, K/D, ADR, HS%, win rate, MVPs, first kills/deaths, clutches e Rating AM.
- Acesso público somente para leitura de partidas e estatísticas. Não são concedidas permissões de escrita direta a usuários comuns.

## Rating AM — fórmula inicial

O Rating AM provisório (0–100) é composto por K/D (35%), ADR (25%), HS% (15%), win rate (20%) e MVPs por partida (5%). K/D é normalizado como K/D × 50; ADR como ADR ÷ 1,5; HS% como HS% ÷ 0,6; cada componente é limitado ao intervalo 0–100. A fórmula é explícita e poderá ser calibrada depois de haver uma amostra razoável de partidas. Não deve ser interpretada como métrica oficial de terceiros.

## Instalação

1. Faça backup do banco Supabase antes de qualquer migration.
2. No Supabase → SQL Editor, execute **`acs-4.0-matches-migration.sql`**. Essa migration pressupõe que o schema original e as migrations ACS 3.0, 3.1, 3.2 e 3.3/3.3.1 já foram aplicados.
3. Extraia o ZIP e envie o conteúdo da pasta `amenduin_acs` para a raiz do repositório GitHub Pages, substituindo os arquivos correspondentes. `index.html` deve ficar diretamente na raiz.
4. Preserve o `supabase-config.js` que já está publicado, com a URL e a publishable/anon key do seu projeto. Não use uma chave `service_role` no navegador.
5. Aguarde o GitHub Pages publicar e atualize com Ctrl+F5.
6. Entre com a conta administradora. Abra **Administração** e registre a partida. A página pública **Partidas** exibe os confrontos registrados.

**Não execute novamente `supabase-schema.sql` nem as migrations antigas.** A migration 4.0 é incremental.

## Como registrar uma partida

1. Entre na conta administradora e abra **Administração**.
2. Preencha Equipe A, Equipe B, placar, mapa, formato e data/hora.
3. Para cada jogador participante, escolha o lado A ou B e informe K, D, A, ADR, HS%, MVP, FK, FD e clutches. Deixe “Não participou” para os demais.
4. Clique em **Registrar partida e atualizar rankings**.
5. Confira a partida na página **Partidas** e os números nos perfis/rankings.

O sistema exige placar com vencedor e ao menos um jogador participante. K/D/A e contagens devem ser inteiros não negativos. ADR e HS% podem ficar em branco se não houver dado confiável.

## Limites conhecidos

- A tela registra partidas já concluídas; não é integração automática com servidor CS2, Steam ou FACEIT.
- Nomes das equipes e placar são informados pelo administrador. O sistema não valida o resultado contra uma API externa.
- O Rating AM é uma fórmula inicial transparente, não um modelo calibrado. Ajuste pesos e normalizações após acumular dados.
- O campo de data/hora é salvo no fuso do navegador convertido para UTC.
- A validação final deve ser feita no projeto Supabase real. O pacote foi verificado estaticamente; não temos acesso ao banco do usuário para executar a migration ou simular permissões reais.
