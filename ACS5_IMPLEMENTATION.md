# ACS 5.0 — integração e operação

## O que está integrado

- Perfis vinculados a uma conta autenticada; a conta cria um perfil e só pode editar o próprio cadastro.
- Avatar por URL e personalização de moldura, fundo e cor do nome, salvos junto com os dados do perfil.
- Badges das funções com classes visuais próprias e filtros/ordenações do diretório de jogadores.
- Cadastro de equipes, convites, elencos, logos e personalização visual.
- Histórico oficial de partidas, relatórios por mapa, estatísticas individuais, participantes convidados, veto/picks e placares por tempo e prorrogação.
- Estatísticas de vitórias TR/CT agregadas e detalhadas por mapa.
- Relatório completo de partida acessível pelo histórico e pelos três resultados recentes da página inicial.
- Rascunhos de partidas salvos localmente e sincronizados com `public.match_drafts` por administrador autenticado.
- Campeonato S1: inscrição pelo capitão, revisão administrativa, fase de grupos, classificação Upper/Lower persistida e partidas vinculadas aos nós do chaveamento.

## Operação do campeonato

1. O capitão inscreve a equipe; o backend valida a janela de inscrição e a quantidade mínima de jogadores.
2. A administração aprova as equipes.
3. Após encerrar as inscrições, a administração organiza o campeonato.
4. A administração registra os jogos da fase de grupos selecionando o confronto no formulário de partidas. O backend atualiza resultados e classificação.
5. Quando todos os jogos de grupos estiverem concluídos, a administração classifica cada equipe em Upper ou Lower. A seleção é gravada na configuração da etapa e sobrevive a uma atualização da página.
6. A administração gera os playoffs; o backend exige que todas as equipes aprovadas estejam classificadas exatamente uma vez, gera as chaves e distribui BYEs. Os vencedores avançam até a Grande Final.

## Limitação conhecida do formato de playoffs

O formato atualmente implementado consiste em uma chave eliminatória Upper, outra chave eliminatória Lower e uma Grande Final entre os vencedores. **Isso não é dupla eliminação clássica**: equipes derrotadas na Upper não descem automaticamente para a Lower. O backend está preparado para a progressão de vencedores e para o preenchimento das partidas, mas a lógica de queda cruzada e reset de Grand Final de uma double elimination clássica ainda precisa ser construída antes de anunciar esse formato como suportado.

Os demais formatos futuros (round-robin, Swiss, grupos configuráveis, single elimination e double elimination clássica) não devem ser considerados concluídos apenas porque existem valores de formato nas tabelas.

## Supabase e migrações

As versões de migração `20261111160749`, `20261111161720` e `20261111162609` correspondem às alterações ACS 5.0 já aplicadas no projeto Supabase `mzdkfmhexrdhercsbmlo`. Os arquivos estão em `supabase/migrations/` para manter o histórico no repositório.

**Não execute essas três migrações novamente no projeto remoto atual.** Em uma instalação nova, confirme primeiro o histórico de migrações e a versão do esquema; depois aplique os arquivos na ordem normal pelo Supabase CLI. A chave usada no navegador deve continuar sendo apenas a publishable/anon key já presente em `supabase-config.js`. Nunca coloque `service_role` ou uma chave secreta no frontend.

## Verificação

O workflow `.github/workflows/acs5-validation.yml` verifica sintaxe JavaScript e algumas integrações estáticas. Isso não substitui um teste completo no navegador com contas reais e permissões de administrador.

Checklist de aceitação após publicação:
- criar conta, confirmar e-mail e criar um perfil;
- tentar criar um segundo perfil na mesma conta e confirmar que o sistema bloqueia;
- atualizar avatar e cores, recarregar e confirmar persistência;
- criar equipe, enviar/aceitar convite, verificar logo e cores;
- iniciar um rascunho de partida, recarregar ou entrar de outra sessão administrativa e confirmar que o rascunho é recuperado;
- salvar uma partida MD1, MD3 e MD5; conferir estatísticas por mapa e TR/CT;
- conferir veto, jogadores convidados e overtime;
- registrar partidas de grupo vinculadas aos confrontos e conferir a classificação;
- atualizar a página após classificar equipes e confirmar que Upper/Lower continuam selecionados;
- gerar playoffs e registrar resultados até a Grande Final;
- abrir uma partida pelos cards da página inicial e pelo histórico.
