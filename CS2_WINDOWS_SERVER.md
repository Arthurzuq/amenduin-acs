# Servidor dedicado ACS — Windows

## Stack escolhido

- CS2 Dedicated Server (Steam AppID 730).
- Metamod:Source 2.x.
- CounterStrikeSharp — usar o pacote Windows, de preferência o bundle `with-runtime` quando for a primeira instalação.
- MatchZy — baixar uma versão compatível com o CounterStrikeSharp instalado.
- ACS Supabase Edge Function para receber relatórios.

O servidor CS2 e o cliente usam o AppID 730. Não use o antigo AppID 740 (era o servidor dedicado separado do CS:GO). SteamCMD é a ferramenta oficial de instalação/atualização de servidores Steam.

## 1. Requisitos da máquina

Antes de abrir o servidor para jogadores, confirme:
- Windows 10/11 64-bit ou Windows Server atualizado.
- CPU com bom desempenho por núcleo e sem throttling.
- 16 GB de RAM recomendados para deixar margem para Windows, servidor e plugins.
- SSD com espaço livre amplo (reserve pelo menos 80 GB para instalação, atualizações e demos).
- Conexão cabeada, estável e com upload suficiente.
- Acesso ao roteador para encaminhamento de portas e um endereço IPv4 público alcançável. CGNAT pode impedir conexões externas mesmo com regras no Windows Firewall.

## 2. Instalar arquivos do servidor

1. Baixe o repositório ACS e execute `scripts/windows/Install-ACS-CS2.ps1` em PowerShell.
2. O script instala SteamCMD e os arquivos do CS2 em `C:ACS-CS2`.
3. O script cria `Start-ACS-Server.ps1` e uma configuração inicial `gamecsgocfgserver.cfg`.
4. Não execute como serviço público ainda; primeiro valide o servidor localmente.

O script usa SteamCMD com login anônimo e `app_update 730 validate`. A instalação inicial é grande e pode demorar.

## 3. Instalar Metamod, CounterStrikeSharp e MatchZy

1. Baixe a versão Windows mais recente do Metamod:Source 2.x.
2. Extraia a pasta `addons` para `C:ACS-CS2gamecsgo`.
3. Edite `C:ACS-CS2gamecsgogameinfo.gi` e adicione a linha `Game csgo/addons/metamod` no bloco de busca de game, conforme a documentação oficial.
4. Baixe o pacote Windows do CounterStrikeSharp com runtime (primeira instalação) e extraia `addons` para `C:ACS-CS2gamecsgo`.
5. Instale os Visual C++ Redistributables exigidos pelo CounterStrikeSharp.
6. Baixe o MatchZy compatível com a versão instalada do CounterStrikeSharp e extraia sua estrutura para `C:ACS-CS2gamecsgo`.
7. Inicie o servidor e valide no console: `meta list` e `css_plugins list`.

**Importante:** versões recentes do MatchZy podem exigir uma versão específica do CounterStrikeSharp e runtime .NET. Verifique os requisitos da release escolhida antes de misturar versões.

## 4. Credenciais e servidor privado

- Crie um Game Server Login Token (GSLT) para AppID 730 em `https://steamcommunity.com/dev/managegameservers`.
- O GSLT é diferente do segredo `ACS_CS2_INGEST_TOKEN` do Supabase.
- Defina `ACS_CS2_GSLT` e `ACS_CS2_SERVER_PASSWORD` somente na sessão PowerShell que inicia o servidor.
- Nunca envie tokens por chat, commit, print ou arquivo público.
- Mantenha `sv_password` ativo e adicione whitelist de SteamID64 no MatchZy quando configurado.
- Não exponha RCON à internet. Use senha forte e acesso administrativo local.

Exemplo de inicialização em PowerShell (substitua os valores localmente; não os envie para ninguém):

```powershell
$env:ACS_CS2_GSLT = "SEU_GSLT"
$env:ACS_CS2_SERVER_PASSWORD = "SENHA_PRIVADA"
cd C:\ACS-CS2
.\Start-ACS-Server.ps1
```

## 5. Rede

- Porta padrão de jogo: UDP 27015 (confirme se não alterou `-port`).
- Crie regra de entrada UDP 27015 no Windows Defender Firewall.
- Encaminhe UDP 27015 no roteador para o IP local fixo/reservado do computador.
- Não abra RCON para a internet.
- Se a operadora usa CGNAT, solicite IPv4 público ou use uma alternativa de rede apropriada; simples port forwarding não resolve CGNAT.
- Teste primeiro de outra rede (por exemplo, dados móveis de um amigo), não apenas na mesma LAN.

## 6. Operação

- O computador deve ficar ligado, sem suspensão automática, durante partidas.
- Use Ethernet em vez de Wi-Fi.
- Atualize o servidor pelo SteamCMD depois de atualizações do CS2.
- Faça backup de `gamecsgocfg`, configurações de plugins e demos.
- Monitore CPU, RAM, temperatura, perda de pacotes e upload.
- Comece com partidas de teste, não campeonato oficial.

## 7. Integração ACS

O Supabase já possui o endpoint `acs-cs2-ingest` e a tabela de relatórios pendentes. O próximo artefato é o plugin coletor ACS para CounterStrikeSharp: ele observará kills, deaths, assists, MVPs, danos, headshots, rounds e mapas, e enviará os relatórios autenticados. A aprovação administrativa e a gravação das estatísticas oficiais serão adicionadas antes de ativar a automação competitiva.

O segredo `ACS_CS2_INGEST_TOKEN` precisa ser criado no Supabase → Edge Functions → Secrets. Ele não é o GSLT. Não há nenhum segredo real neste repositório.

## Fontes técnicas

- SteamCMD / Steam Support: https://help.steampowered.com/en/faqs/view/5E9C-65C2-C968-98DC
- CounterStrikeSharp — instalação: https://docs.cssharp.dev/docs/guides/getting-started
- MatchZy — instalação: https://shobhit-pathak.github.io/MatchZy/installation/
- Steam Game Server Login Token: https://steamcommunity.com/dev/managegameservers
