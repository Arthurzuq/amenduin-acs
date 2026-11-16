# Integração ACS ↔ CS2 — fase 1 (recepção segura de resultados)

## Arquitetura

- Servidor dedicado privado de CS2.
- Metamod:Source + CounterStrikeSharp.
- MatchZy para fluxo competitivo (ready, veto, pausas, configuração BO1/BO3/BO5).
- Edge Function `acs-cs2-ingest` como único endpoint de ingestão.
- Supabase armazena relatórios brutos em `acs_cs2_match_reports`, sempre como `pending`.
- O relatório NÃO altera partidas oficiais, Rating AM, economia ou conquistas automaticamente. A aprovação administrativa será uma etapa separada.

## Pré-requisitos de infraestrutura

1. Hospedar um servidor dedicado Linux/Windows com recursos suficientes e portas de jogo/RCON configuradas.
2. Instalar CS2 Dedicated Server, Metamod:Source, CounterStrikeSharp e MatchZy.
3. Usar uma versão de MatchZy compatível com a versão instalada do CounterStrikeSharp. Testar em servidor de homologação antes de jogos oficiais.
4. Manter o servidor fechado por senha/whitelist e limitar RCON à rede administrativa.

Referências:
- CounterStrikeSharp: https://docs.cssharp.dev/
- MatchZy: https://shobhit-pathak.github.io/MatchZy/installation/
- MatchZy Enhanced: https://github.com/Auto-Tournament/matchzy-enhanced

## Configuração do Supabase

A Edge Function foi preparada para receber:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (fornecidos pelo ambiente Supabase).
- `ACS_CS2_INGEST_TOKEN` (segredo aleatório de pelo menos 32 bytes, exclusivo do servidor).

No Dashboard do Supabase, abra Project Settings → Edge Functions → Secrets e adicione `ACS_CS2_INGEST_TOKEN`. Não coloque esse valor no site, no GitHub ou em mensagens. O servidor dedicado deve recebê-lo como variável de ambiente.

Endpoint:
`https://mzdkfmhexrdhercsbmlo.supabase.co/functions/v1/acs-cs2-ingest`

Cabeçalho:
`x-acs-server-token: <ACS_CS2_INGEST_TOKEN>`

A function usa autenticação própria por token compartilhado, portanto o deploy está configurado com `verify_jwt=false`. A chave service role nunca é enviada ao servidor do jogo.

## Contrato do relatório (JSON)

```json
{
  "schema_version": 1,
  "server_id": "acs-main-01",
  "external_match_id": "acs-match-uuid-or-series-id",
  "match_id": "UUID da partida já criada no ACS",
  "maps": [
    {
      "map_number": 1,
      "map_name": "de_mirage",
      "team_a_score": 13,
      "team_b_score": 9,
      "players": [
        {
          "steam_id64": "76561198000000000",
          "nickname": "Nick",
          "team_side": "A",
          "kills": 20,
          "deaths": 12,
          "assists": 4,
          "mvps": 3,
          "damage": 1840,
          "headshot_kills": 9
        }
      ]
    }
  ]
}
```

Cada mapa deve conter os participantes dos dois times. O ACS valida SteamID64, limites de valores, partida existente e duplicidade. Um relatório idêntico repetido é idempotente; um segundo relatório diferente para a mesma partida é recusado para evitar sobrescrita silenciosa.

## Limites desta fase

- O banco e o endpoint de recepção estão preparados; o segredo ainda precisa ser cadastrado pelo administrador no Dashboard.
- O plugin coletor CounterStrikeSharp que observa eventos ao vivo e envia o JSON ainda precisa ser compilado/testado em uma instância real de CS2.
- A interface administrativa para vincular SteamID64 e aprovar/rejeitar relatórios é a próxima etapa.
- Não é possível validar um servidor de jogo sem uma máquina/host CS2 ativa e credenciais de acesso fornecidas pelo administrador.
