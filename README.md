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


## ACS 4.1 — Partidas públicas e registro corrigido

1. Execute `acs-4.1-matches-public-migration.sql` no Supabase SQL Editor.
2. Substitua os arquivos do site pelos arquivos desta pasta, preservando seu `supabase-config.js`.
3. A seção **Partidas** agora contém o formulário de registro (visível somente para administradores), o histórico público e uma tabela pública de estatísticas.
4. Jogadores comuns podem consultar resultados e estatísticas, mas não registrar nem excluir partidas.

A migration é incremental e reaplicável. Não execute novamente `supabase-schema.sql`.

## ACS 4.2 — equipes, séries e desempenho por mapa/lado

1. Faça backup do projeto atual.
2. No Supabase SQL Editor, execute `acs-4.2-team-series-migration.sql` depois das migrations 3.1, 3.3/3.3.1 e 4.1.
3. Preserve o seu `supabase-config.js` atual. Não substitua URL nem Publishable/anon key pelos valores de exemplo.
4. Substitua os arquivos do site pelos arquivos desta versão e publique o commit no GitHub Pages.

A atualização torna equipes e elencos legíveis publicamente, adiciona seletores de equipes e mapas no registro, registra placares dos dois tempos e prorrogações, e cria ranking de equipes e estatísticas de mapas fortes/fracos. A taxa TR/CT dos jogadores é calculada com base nos rounds ganhos e disputados pelo lado da equipe que representaram. MD2 aceita empate em 1–1. A migration também ajusta a restrição antiga da coluna `best_of` para aceitar o formato MD2 sem perder suporte a registros MD5 antigos. Em MD3, informe dois mapas se a série terminar 2–0 ou três mapas se terminar 2–1.

O formulário oferece MD1, MD2 e MD3: MD1 exige um mapa; MD2 exige dois mapas e pode terminar 1–1; MD3 aceita dois mapas (2–0) ou três mapas (2–1). Em cada mapa, o primeiro tempo soma 12 rounds; o segundo tempo pode terminar antes de 12 quando uma equipe alcança 13. Se o regulamento terminar 12–12, preencha a prorrogação MR3. Para prorrogações sucessivas, informe o total de rounds ganhos em TR e CT de cada equipe; os totais precisam corresponder a blocos completos de 6 rounds.

O ranking de equipes usa 75% de taxa de vitórias em séries e 25% de diferencial médio de mapas vencidos. Mapas fortes/fracos só são destacados após pelo menos duas aparições naquele mapa, evitando destacar um mapa com amostra de uma única partida.

**Importante:** a migration foi preparada para o schema ACS 4.1 e o JavaScript foi validado com `node --check`. Não foi possível executar a migration no projeto Supabase real do usuário nesta sessão. Faça primeiro a migration e teste com uma série de teste antes de cadastrar resultados oficiais.


## ACS 4.2.1 — correções
- Removido o campo de equipe do cadastro/edição de perfil. A equipe passa a ser definida por equipe criada e vínculo real no elenco.
- O contador da página inicial passa a contar registros reais da tabela `teams`.
- Administradores podem excluir qualquer equipe pela página Equipes; capitães continuam podendo excluir a própria equipe.
- Migration `acs-4.2.1-correcao-equipes-mercado.sql`: cria/atualiza `transfer_offers`, corrige a permissão de exclusão administrativa, limpa nomes de equipes sem vínculo real e atualiza o cache do Supabase.

**Atualização:** substitua os arquivos do site pelos arquivos deste pacote, mas mantenha o seu `supabase-config.js` atual. Depois execute o arquivo SQL 4.2.1 inteiro no Supabase. Não execute novamente `supabase-schema.sql` nem migrations antigas.

## ACS 4.3 — Transferências, MD1/MD3/MD5 e estatísticas por mapa

Esta atualização é incremental sobre ACS 4.2.1.

### Alterações

- Aceitar uma proposta de transferência agora move o jogador para `team_members` da equipe do jogador que enviou a proposta. O nome da equipe e o registro de transferência também são atualizados na mesma operação do banco.
- Um jogador precisa pertencer a uma equipe para enviar uma proposta de transferência. Capitães precisam transferir a liderança antes de sair da equipe.
- Removido o limite artificial de integrantes por equipe. Convites podem ser enviados sem capacidade máxima configurada.
- Formatos de partida disponíveis: MD1, MD3 e MD5. MD2 foi removido.
- O registro da partida permite definir, por jogador, equipe, titular/reserva/não jogou.
- K/D/A, ADR, HS%, MVP, first kills/deaths e clutches são registrados separadamente para cada jogador em cada mapa. A tabela pública **Desempenho por mapa** agrega os números por jogador e mapa.
- O histórico público de partidas foi simplificado para mostrar equipes, placar da série e bolinhas por mapa: cada equipe tem sua linha, e o mapa vencido aparece com bolinha branca.

### Instalação ACS 4.3

1. Faça backup do Supabase antes de executar a migration.
2. No SQL Editor, abra uma consulta nova e execute **o arquivo inteiro** `acs-4.3-transferencia-md5-stats-mapa.sql`.
3. Substitua os arquivos do site pelos desta pasta.
4. Preserve o seu `supabase-config.js` atual. Ele não deve ser substituído por arquivo de configuração de exemplo.
5. Publique o site e atualize o navegador com Ctrl+F5.

Não execute novamente `supabase-schema.sql` nem migrations anteriores. Execute somente a migration 4.3 nesta atualização.

A migration foi revisada estaticamente, mas não foi executada no banco Supabase real. Faça a instalação em uma janela de manutenção/backup e confirme o resultado antes de registrar partidas oficiais.
