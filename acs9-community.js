/* ACS 9.4 — community hub, career, notifications and account shortcut */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtDate = v => v ? new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}) : "Data não informada";
  const ownProfile = () => typeof currentPlayerProfile === "function" ? currentPlayerProfile() : null;
  let notifications = [];
  let communityMatches = [];
  let careerRows = [];
  function profileAvatar(p){
    if(p?.avatarUrl) return '<img src="'+esc(p.avatarUrl)+'" alt="Foto do perfil">';
    const name=p?.nickname||"?";
    return esc(name.slice(0,2).toUpperCase());
  }
  function refreshProfileMenu(){
    const trigger=$("#acsProfileTrigger"), avatar=$("#acsProfileAvatar"), menu=$("#acsProfileMenu");
    if(!trigger||!avatar||!menu)return;
    const p=ownProfile();
    avatar.innerHTML=profileAvatar(p);
    trigger.title=p?("Perfil de "+p.nickname):"Entrar ou criar conta";
    trigger.classList.toggle("has-profile",!!p);
    menu.innerHTML=p
      ? '<div class="profile-menu-user"><b>'+esc(p.nickname)+'</b><small>'+esc(p.team||"Sem equipe")+'</small></div><button data-profile-action="view">◉  Meu perfil</button><button data-profile-action="edit">✎  Editar perfil</button><button data-profile-action="community">✦  Minha carreira</button><button data-profile-action="logout">↪  Sair da conta</button>'
      : '<div class="profile-menu-user"><b>Visitante</b><small>Entre para acessar seu perfil</small></div><button data-profile-action="login">Entrar / Criar conta</button>';
    trigger.setAttribute("aria-expanded","false");
  }
  function toggleProfileMenu(force){
    const menu=$("#acsProfileMenu"), trigger=$("#acsProfileTrigger");if(!menu||!trigger)return;
    const open=typeof force==="boolean"?force:menu.hidden;
    menu.hidden=!open;trigger.setAttribute("aria-expanded",String(open));
  }
  $("#acsProfileTrigger")?.addEventListener("click",()=>toggleProfileMenu());
  document.addEventListener("click",e=>{if(!e.target.closest("#acsProfileTrigger")&&!e.target.closest("#acsProfileMenu"))toggleProfileMenu(false);});
  $("#acsProfileMenu")?.addEventListener("click",async e=>{
    const b=e.target.closest("[data-profile-action]");if(!b)return;
    const action=b.dataset.profileAction,p=ownProfile();toggleProfileMenu(false);
    if(action==="login"){$("#authModal")?.classList.add("open");return;}
    if(action==="view"&&p&&typeof openDetail==="function")openDetail(p.id);
    if(action==="edit"&&p&&typeof openForm==="function")openForm(p);
    if(action==="community"){go("community");renderCareer();}
    if(action==="logout")$("#authButton")?.click();
  });
  function pageCommunity(){go("community");loadCommunity();}
  async function loadCommunity(){
    refreshProfileMenu();
    await Promise.all([loadNotifications(),loadCalendar(),loadHallOfFame(),loadTeams(),loadAdminActivity()]);
    await renderCareer();
  }
  async function loadNotifications(){
    const host=$("#acsNotifications");if(!host)return;
    if(!currentUser||!supabaseClient){host.innerHTML='<div class="community-empty">Entre na conta para receber convites, propostas e avisos da Liga.</div>';return;}
    const {data,error}=await supabaseClient.from("acs_notifications").select("id,title,body,category,target_page,read_at,created_at").order("created_at",{ascending:false}).limit(40);
    if(error){host.innerHTML='<div class="community-empty">Não foi possível carregar notificações. '+esc(error.message)+'</div>';return;}
    notifications=data||[];
    const unread=notifications.filter(n=>!n.read_at).length;
    const trigger=$("#acsProfileTrigger");
    if(trigger){let badge=trigger.querySelector(".profile-notification-count");if(unread){if(!badge){badge=document.createElement("i");badge.className="profile-notification-count";trigger.append(badge);}badge.textContent=unread>9?"9+":String(unread);}else badge?.remove();}
    host.innerHTML=notifications.length?notifications.map(n=>'<article class="community-item '+(!n.read_at?"unread":"")+'"><div><b>'+esc(n.title)+'</b><small>'+esc(n.body)+' · '+fmtDate(n.created_at)+'</small></div><div><button data-notice-open="'+esc(n.id)+'">Abrir</button></div></article>').join(""):'<div class="community-empty">Você está em dia. Nenhuma notificação recebida.</div>';
    host.querySelectorAll("[data-notice-open]").forEach(btn=>btn.addEventListener("click",async()=>{
      const n=notifications.find(x=>x.id===btn.dataset.noticeOpen);if(!n)return;
      if(!n.read_at){await supabaseClient.from("acs_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);n.read_at=new Date().toISOString();}
      if(n.target_page)go(n.target_page);loadNotifications();
    }));
  }
  $("#acsMarkAllRead")?.addEventListener("click",async()=>{
    if(!currentUser||!supabaseClient)return;
    const {error}=await supabaseClient.from("acs_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);
    if(error){toast("Não foi possível atualizar notificações: "+error.message);return;}loadNotifications();
  });
  async function loadCalendar(){
    const host=$("#acsCalendar");if(!host)return;
    const form=$("#acsScheduleForm");
    if(form){
      form.hidden=!isAdmin||!supabaseClient;
      if(isAdmin&&supabaseClient){
        const {data:teams}=await supabaseClient.from("teams").select("id,name").order("name");
        const options='<option value="">Selecione...</option>'+(teams||[]).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
        $("#acsScheduleTeamA").innerHTML=options;$("#acsScheduleTeamB").innerHTML=options;
      }
    }
    if(!supabaseClient){host.innerHTML='<div class="community-empty">Agenda indisponível sem conexão.</div>';return;}
    const now=new Date().toISOString();
    const {data,error}=await supabaseClient.from("matches").select("id,played_at,team_a_name,team_b_name,best_of,status").eq("status","scheduled").gte("played_at",now).order("played_at").limit(25);
    if(error){host.innerHTML='<div class="community-empty">Não foi possível carregar agenda: '+esc(error.message)+'</div>';return;}
    communityMatches=data||[];
    host.innerHTML=communityMatches.length?communityMatches.map(m=>'<article class="community-item"><div><b>'+esc(m.team_a_name||"Equipe A")+' <span>vs</span> '+esc(m.team_b_name||"Equipe B")+'</b><small>'+fmtDate(m.played_at)+' · MD'+(m.best_of||1)+'</small></div><span class="badge-admin">AGENDADA</span></article>').join(""):'<div class="community-empty">Nenhuma partida futura foi agendada. Quando a organização marcar confrontos, eles aparecerão aqui.</div>';
  }
  function achievementMarkup(icon,title,desc,unlocked){return '<article class="achievement '+(unlocked?"":"locked")+'"><span>'+icon+'</span><b>'+esc(title)+'</b><small>'+esc(desc)+'</small><small>'+(unlocked?"Desbloqueada":"Ainda não desbloqueada")+'</small></article>';}
  async function renderCareer(){
    const host=$("#acsCareer");if(!host)return;
    const p=ownProfile();
    if(!p){host.innerHTML='<div class="community-empty">Vincule um perfil de jogador à sua conta para visualizar sua carreira.</div>';return;}
    let matchCount=Number(p.matches||0),kills=Number(p.kills||0),assists=Number(p.assists||0),mvps=Number(p.mvps||0),rating=Number(p.rating||0),win=Number(p.win||0);
    let ratingHistory=[],mapRows=[],prizes=[];
    if(supabaseClient){
      const [matchRes,ratingRes,mapRes,teamRes]=await Promise.all([
        supabaseClient.from("player_match_stats").select("match_id,kills,deaths,assists,mvps,matches(played_at,team_a_name,team_b_name,team_a_score,team_b_score,status)").eq("player_id",p.id).order("match_id",{ascending:false}).limit(100),
        supabaseClient.from("acs_player_rating_history").select("rating_am,recorded_at").eq("player_id",p.id).order("recorded_at",{ascending:true}).limit(40),
        supabaseClient.from("player_map_stats").select("map_name,kills,deaths,adr").eq("player_id",p.id).limit(500),
        supabaseClient.from("team_members").select("team_id").eq("player_id",p.id).limit(1)
      ]);
      careerRows=matchRes.data||[];ratingHistory=ratingRes.data||[];mapRows=mapRes.data||[];
      if(teamRes.data?.[0]?.team_id){
        const awardRes=await supabaseClient.from("tournament_prize_awards").select("placement,tier,amount,awarded_at,tournaments(name)").eq("team_id",teamRes.data[0].team_id).order("awarded_at",{ascending:false}).limit(10);
        prizes=awardRes.data||[];
      }
      if(careerRows.length){matchCount=Math.max(matchCount,careerRows.length);kills=Math.max(kills,careerRows.reduce((a,r)=>a+Number(r.kills||0),0));assists=Math.max(assists,careerRows.reduce((a,r)=>a+Number(r.assists||0),0));mvps=Math.max(mvps,careerRows.reduce((a,r)=>a+Number(r.mvps||0),0));}
    }
    const mapTotals={};
    mapRows.forEach(r=>{const name=r.map_name||"Desconhecido";mapTotals[name]??={games:0,kills:0,deaths:0,adr:0,adrCount:0};const m=mapTotals[name];m.games++;m.kills+=Number(r.kills||0);m.deaths+=Number(r.deaths||0);if(r.adr!=null){m.adr+=Number(r.adr);m.adrCount++;}});
    const bestMaps=Object.entries(mapTotals).sort((a,b)=>(b[1].kills/Math.max(1,b[1].games))-(a[1].kills/Math.max(1,a[1].games))).slice(0,4);
    const kd=Number(p.kd||0),adr=Number(p.adr||0),hs=Number(p.hs||0);
    const ach=[
      // Primeiras conquistas: metas curtas para recompensar o início da carreira.
      achievementMarkup("🎯","1st KILL","Consiga sua primeira eliminação em uma partida oficial.",kills>=1),
      achievementMarkup("🔫","Primeiros 10 abates","Registre 10 eliminações.",kills>=10),
      achievementMarkup("💥","Aquecendo a mira","Registre 25 eliminações.",kills>=25),
      achievementMarkup("☠️","Pequeno massacre","Registre 50 eliminações.",kills>=50),
      achievementMarkup("🤝","Primeira assistência","Contribua com sua primeira assistência.",assists>=1),
      achievementMarkup("🫱‍🫲","Bom companheiro","Registre 5 assistências.",assists>=5),
      achievementMarkup("🛡️","Jogo coletivo","Registre 10 assistências.",assists>=10),
      achievementMarkup("⭐","Suporte presente","Registre 25 assistências.",assists>=25),
      achievementMarkup("🏅","Primeiro MVP","Conquiste seu primeiro MVP.",mvps>=1),
      achievementMarkup("⚔️","Primeiro confronto","Dispute sua primeira partida oficial.",matchCount>=1),
      achievementMarkup("🎯","Veterano","Alcance 10 partidas oficiais.",matchCount>=10),
      achievementMarkup("💀","Centenário","Registre 100 eliminações.",kills>=100),
      achievementMarkup("🏅","Jogador decisivo","Conquiste 5 MVPs.",mvps>=5),
      achievementMarkup("🔥","Alta performance","Alcance 60% de win rate com pelo menos 5 partidas.",win>=60&&matchCount>=5),
      achievementMarkup("👑","Elite ACS","Alcance Rating AM de 80.",rating>=80),

      // Conquistas adicionais: todas usam apenas estatísticas que já são registradas.
      achievementMarkup("🧭","Rosto conhecido","Dispute 5 partidas oficiais.",matchCount>=5),
      achievementMarkup("🛡️","Presença constante","Dispute 25 partidas oficiais.",matchCount>=25),
      achievementMarkup("🏟️","Lenda dos servidores","Dispute 50 partidas oficiais.",matchCount>=50),
      achievementMarkup("🎯","Caçador de eliminações","Registre 250 eliminações.",kills>=250),
      achievementMarkup("💥","Máquina de abates","Registre 500 eliminações.",kills>=500),
      achievementMarkup("☠️","Exterminador","Registre 1.000 eliminações.",kills>=1000),
      achievementMarkup("🌋","Força imparável","Registre 2.500 eliminações.",kills>=2500),
      achievementMarkup("🥉","Destaque da rodada","Conquiste 10 MVPs.",mvps>=10),
      achievementMarkup("🥈","Protagonista","Conquiste 25 MVPs.",mvps>=25),
      achievementMarkup("🥇","Rei dos MVPs","Conquiste 50 MVPs.",mvps>=50),
      achievementMarkup("📈","Rating em ascensão","Alcance Rating AM de 90.",rating>=90),
      achievementMarkup("🚀","Dominância","Alcance 70% de win rate com pelo menos 10 partidas.",win>=70&&matchCount>=10),
      achievementMarkup("⚖️","Consistência positiva","Mantenha K/D de pelo menos 1,50.",kd>=1.5),
      achievementMarkup("💎","Superioridade","Mantenha K/D de pelo menos 2,00.",kd>=2),
      achievementMarkup("🔫","Dano consistente","Alcance 80 de ADR médio.",adr>=80),
      achievementMarkup("💣","Alto impacto","Alcance 90 de ADR médio.",adr>=90),
      achievementMarkup("🧨","Dano absurdo","Alcance 100 de ADR médio.",adr>=100),
      achievementMarkup("🎯","Mira afiada","Alcance 50% de HS.",hs>=50),
      achievementMarkup("🦅","Precisão cirúrgica","Alcance 65% de HS.",hs>=65)
    ];
    const values=ratingHistory.map(r=>Number(r.rating_am));
    const minRating=values.length?Math.min(...values):0,maxRating=values.length?Math.max(...values):100;
    const points=values.map((v,i)=>{const x=24+(i/Math.max(1,values.length-1))*552;const y=130-((v-minRating)/Math.max(1,maxRating-minRating))*100;return x.toFixed(1)+","+y.toFixed(1);}).join(" ");
    const chart=values.length>1?'<svg class="career-chart" viewBox="0 0 600 155" role="img" aria-label="Evolução do Rating AM"><line x1="24" y1="130" x2="576" y2="130" stroke="#34465c"/><polyline points="'+points+'" fill="none" stroke="#77b8ed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="24" y="148" fill="#8ea0b5" font-size="10">'+esc(fmtDate(ratingHistory[0].recorded_at))+'</text><text x="576" y="148" text-anchor="end" fill="#8ea0b5" font-size="10">'+esc(fmtDate(ratingHistory[ratingHistory.length-1].recorded_at))+'</text></svg>':'<div class="community-empty">A evolução do Rating AM começará a aparecer após novas avaliações oficiais.</div>';
    const recent=careerRows.length?careerRows.slice(0,8).map(r=>{const m=r.matches||{};return '<article class="community-item"><div><b>'+esc(m.team_a_name||"Equipe A")+' vs '+esc(m.team_b_name||"Equipe B")+'</b><small>'+fmtDate(m.played_at)+' · '+Number(r.kills||0)+' / '+Number(r.deaths||0)+' / '+Number(r.assists||0)+'</small></div><span>'+(m.status==="completed"?"Concluída":"Registrada")+'</span></article>';}).join(""):'<div class="community-empty">O histórico detalhado aparecerá após suas próximas partidas oficiais.</div>';
    host.innerHTML='<div class="community-item community-career-summary"><div><b>'+esc(p.nickname)+'</b><small>'+matchCount+' partidas · '+kills+' kills · '+mvps+' MVPs · '+prizes.length+' premiações da equipe atual</small></div><button data-career-profile>Ver perfil completo</button></div><div class="achievement-grid">'+ach.join("")+'</div><div class="detail-section"><h3>Evolução do Rating AM</h3>'+chart+'</div><div class="detail-section"><h3>Desempenho por mapa</h3><div class="community-list">'+(bestMaps.length?bestMaps.map(([name,m])=>'<article class="community-item"><div><b>'+esc(name)+'</b><small>'+m.games+' mapas disputados · '+(m.adrCount?(m.adr/m.adrCount).toFixed(1)+' ADR médio':'ADR não informado')+'</small></div><strong>'+(m.kills/Math.max(1,m.deaths)).toFixed(2)+' K/D</strong></article>').join(""):'<div class="community-empty">Sem estatísticas por mapa.</div>')+'</div></div><div class="detail-section"><h3>Partidas recentes</h3><div class="community-list">'+recent+'</div></div><div class="detail-section"><h3>Títulos e premiações</h3><div class="community-list">'+(prizes.length?prizes.map(a=>'<article class="community-item"><div><b>'+esc(a.tournaments?.name||"Campeonato")+' · '+a.placement+'º lugar</b><small>Tier '+esc(a.tier)+' · '+fmtDate(a.awarded_at)+'</small></div><strong>$'+Number(a.amount||0).toLocaleString("pt-BR")+'</strong></article>').join(""):'<div class="community-empty">Nenhuma premiação vinculada à equipe atual.</div>')+'</div></div>';
    host.querySelector("[data-career-profile]")?.addEventListener("click",()=>openDetail(p.id));
  }
  async function loadHallOfFame(){
    const host=$("#acsHallOfFame");if(!host)return;
    const sorted=(players||[]).filter(p=>p.rating!=null).slice().sort((a,b)=>Number(b.rating)-Number(a.rating)).slice(0,10);
    host.innerHTML=sorted.length?sorted.map((p,i)=>'<article class="community-item"><div><b>#'+(i+1)+' · '+esc(p.nickname)+'</b><small>'+esc(p.team||"Sem equipe")+' · '+(p.matches||0)+' partidas · '+(p.kd??"—")+' K/D</small></div><strong>'+Number(p.rating).toFixed(1)+'</strong></article>').join(""):'<div class="community-empty">O Hall da Fama será preenchido conforme a Liga publicar avaliações oficiais.</div>';
  }
  async function loadTeams(){
    const host=$("#acsTeamDirectory");if(!host)return;
    if(!supabaseClient){host.innerHTML='<div class="community-empty">Conecte-se para consultar as equipes.</div>';return;}
    const {data,error}=await supabaseClient.from("teams").select("id,name,tag,logo_url,captain_player_id,created_at").order("name");
    if(error){host.innerHTML='<div class="community-empty">Erro ao carregar equipes: '+esc(error.message)+'</div>';return;}
    const teams=data||[];
    host.innerHTML=teams.length?'<div class="achievement-grid">'+teams.map(t=>'<button class="team-directory-card" data-team-detail="'+esc(t.id)+'"><span class="team-directory-logo">'+(t.logo_url?'<img src="'+esc(t.logo_url)+'" alt="">':esc((t.tag||t.name||"?").slice(0,3)))+'</span><span><b>'+esc(t.name)+'</b><small>'+(t.tag?esc(t.tag)+" · ":"")+"Ver elenco e histórico"+'</small></span></button>').join("")+'</div>':'<div class="community-empty">Nenhuma equipe cadastrada.</div>';
    host.querySelectorAll("[data-team-detail]").forEach(b=>b.addEventListener("click",()=>openTeamDetail(teams.find(t=>t.id===b.dataset.teamDetail))));
  }
  async function openTeamDetail(team){
    if(!team||!supabaseClient)return;
    const now=new Date().toISOString();
    const [{data:members},{data:matches},{data:awards},{data:fixtures,error:fixturesError},{data:scheduled,error:scheduledError}]=await Promise.all([
      supabaseClient.from("team_members").select("player_id,role,players(id,nickname,main_role,avatar_url)").eq("team_id",team.id),
      supabaseClient.from("matches").select("id,played_at,team_a_id,team_b_id,team_a_name,team_b_name,team_a_score,team_b_score,status").or("team_a_id.eq."+team.id+",team_b_id.eq."+team.id).eq("status","completed").order("played_at",{ascending:false}).limit(10),
      supabaseClient.from("tournament_prize_awards").select("placement,tier,amount,awarded_at,tournaments(name)").eq("team_id",team.id).order("awarded_at",{ascending:false}).limit(10),
      supabaseClient.from("tournament_bracket_nodes").select("id,tournament_id,stage_id,bracket_side,round_number,match_number,team_a_id,team_b_id,winner_team_id,match_id,status,config,tournaments(name),tournament_stages(name),team_a:teams!tournament_bracket_nodes_team_a_id_fkey(name),team_b:teams!tournament_bracket_nodes_team_b_id_fkey(name),matches:matches!tournament_bracket_nodes_match_id_fkey(played_at,status,best_of)").or("team_a_id.eq."+team.id+",team_b_id.eq."+team.id).order("round_number").limit(50),
      supabaseClient.from("matches").select("id,played_at,team_a_id,team_b_id,team_a_name,team_b_name,best_of,tournament_id,tournaments(name)").or("team_a_id.eq."+team.id+",team_b_id.eq."+team.id).eq("status","scheduled").gte("played_at",now).order("played_at").limit(30)
    ]);
    let modal=$("#acsTeamDetailModal");
    if(!modal){modal=document.createElement("div");modal.id="acsTeamDetailModal";modal.className="modal-backdrop";modal.innerHTML='<div class="modal detail-modal"><div id="acsTeamDetailContent"></div></div>';document.body.append(modal);modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-team-close]"))modal.classList.remove("open");});}
    const roster=members||[],history=matches||[],honors=awards||[],tournamentFixtures=fixtures||[],upcoming=scheduled||[];
    const wins=history.filter(m=>(m.team_a_id===team.id?m.team_a_score>m.team_b_score:m.team_b_score>m.team_a_score)).length;
    const linkedIds=new Set(tournamentFixtures.map(f=>f.match_id).filter(Boolean));
    const scheduledHtml=upcoming.filter(m=>!linkedIds.has(m.id)).map(m=>'<article class="community-item"><div><b>'+esc(m.team_a_name||"Equipe A")+' <span>vs</span> '+esc(m.team_b_name||"Equipe B")+'</b><small>'+esc(m.tournaments?.name||"Partida agendada")+' · '+fmtDate(m.played_at)+' · MD'+(m.best_of||1)+'</small></div><span class="badge-admin">AGENDADA</span></article>').join("");
    const tournamentAgendaHtml=tournamentFixtures.map(f=>{
      const match=f.matches||null,scheduledAt=match?.played_at||f.config?.scheduled_at||f.config?.scheduledAt||null;
      const stage=f.tournament_stages?.name||(f.bracket_side==="groups"?"Fase de grupos":"Mata-mata");
      const state=match?.status==="completed"||f.status==="completed"?"Concluída":f.status==="ready"?"Confronto definido":f.status==="in_progress"?"Em andamento":"Aguardando classificação";
      return '<article class="community-item"><div><b>'+esc(f.team_a?.name||"A definir")+' <span>vs</span> '+esc(f.team_b?.name||"A definir")+'</b><small>'+esc(f.tournaments?.name||"Campeonato")+' · '+esc(stage)+' · Rodada '+Number(f.round_number||1)+(scheduledAt?' · '+fmtDate(scheduledAt):' · Data e horário a definir')+'</small></div><span class="badge-admin">'+esc(state.toUpperCase())+'</span></article>';
    }).join("");
    const agendaHtml=scheduledHtml+tournamentAgendaHtml;
    const agendaError=fixturesError||scheduledError;
    const honorsHtml=honors.length?honors.map(a=>'<article class="community-item"><div><b>'+(Number(a.placement)===1?'Campeã':Number(a.placement)===2?'Vice-campeã':'Top '+a.placement)+' · '+esc(a.tournaments?.name||'Campeonato')+'</b><small>Tier '+esc(a.tier)+' · '+fmtDate(a.awarded_at)+'</small></div><strong>$'+Number(a.amount||0).toLocaleString('pt-BR')+'</strong></article>').join(""):'<p class="muted">Nenhuma premiação registrada para esta equipe.</p>';
    const historyHtml=history.length?history.map(m=>'<article class="community-item"><div><b>'+esc(m.team_a_name)+' '+m.team_a_score+' × '+m.team_b_score+' '+esc(m.team_b_name)+'</b><small>'+fmtDate(m.played_at)+'</small></div></article>').join(""):'<p class="muted">Ainda não há partidas concluídas registradas para esta equipe.</p>';
    const agendaContent=agendaError?'<p class="muted">Não foi possível carregar a agenda: '+esc(agendaError.message)+'</p>':(agendaHtml||'<p class="muted">Nenhuma partida agendada ou confronto de campeonato encontrado para esta equipe.</p>');
    $("#acsTeamDetailContent").innerHTML='<div class="modal-head"><div><span class="eyebrow">TEAM PROFILE</span><h2>'+esc(team.name)+'</h2></div><button class="icon-button" data-team-close>×</button></div><section class="detail-section"><h3>Resumo competitivo</h3><p class="detail-bio">'+roster.length+' integrantes · '+wins+' vitórias nos últimos '+history.length+' resultados listados</p></section><section class="detail-section"><h3>Elenco atual</h3><div class="team-detail-roster">'+(roster.length?roster.map(m=>'<button data-team-player="'+esc(m.player_id)+'"><b>'+esc(m.players?.nickname||"Jogador")+'</b><small>'+esc(m.role==="captain"?"Capitão":m.players?.main_role||"Integrante")+'</small></button>').join(""):'<p class="muted">Nenhum integrante cadastrado.</p>')+'</div></section><section class="detail-section"><h3>Agenda de jogos</h3><div class="community-list">'+agendaContent+'</div></section><section class="detail-section"><h3>Conquistas e premiações</h3><div class="community-list">'+honorsHtml+'</div></section><section class="detail-section"><h3>Últimos resultados</h3><div class="community-list">'+historyHtml+'</div></section>';
    modal.classList.add("open");
    $("#acsTeamDetailContent").querySelectorAll("[data-team-player]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.teamPlayer;const p=(players||[]).find(x=>x.id===id);if(p){modal.classList.remove("open");openDetail(id);}}));
  }
  async function loadAdminActivity(){
    const panel=$("#acsAdminActivityPanel"),host=$("#acsAdminActivity");if(!panel||!host)return;
    panel.hidden=!isAdmin;if(!isAdmin||!supabaseClient)return;
    const {data,error}=await supabaseClient.from("acs_admin_audit_log").select("id,action,old_values,new_values,created_at,player_id,players(nickname)").order("created_at",{ascending:false}).limit(30);
    if(error){host.innerHTML='<div class="community-empty">Não foi possível carregar auditoria: '+esc(error.message)+'</div>';return;}
    host.innerHTML=(data||[]).length?data.map(a=>'<article class="community-item"><div><b>'+esc(a.action)+'</b><small>'+esc(a.players?.nickname||"Registro geral")+' · '+fmtDate(a.created_at)+'</small></div><small>'+esc(JSON.stringify(a.new_values||{}).slice(0,110))+'</small></article>').join(""):'<div class="community-empty">Nenhuma alteração administrativa registrada.</div>';
  }
  $("#acsScheduleForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!isAdmin||!supabaseClient){toast("Somente administradores podem agendar partidas.");return;}
    const teamA=$("#acsScheduleTeamA").value,teamB=$("#acsScheduleTeamB").value,raw=$("#acsScheduleDate").value;
    if(!teamA||!teamB||teamA===teamB||!raw){toast("Selecione duas equipes diferentes e informe a data.");return;}
    const date=new Date(raw);
    if(Number.isNaN(date.getTime())||date<=new Date()){toast("Escolha uma data futura.");return;}
    const button=e.submitter;if(button){button.disabled=true;button.textContent="Agendando...";}
    const {error}=await supabaseClient.rpc("acs_admin_schedule_match",{p_team_a_id:teamA,p_team_b_id:teamB,p_played_at:date.toISOString(),p_best_of:Number($("#acsScheduleBo").value)});
    if(button){button.disabled=false;button.textContent="Agendar partida";}
    if(error){toast("Não foi possível agendar: "+error.message);return;}
    $("#acsScheduleForm").reset();toast("Partida agendada. As equipes receberão uma notificação.");loadCalendar();
  });
  $("#acsCommunityRefresh")?.addEventListener("click",loadCommunity);
  // Refresh account identity periodically; notifications refresh only while the hub is visible.
  setInterval(()=>{refreshProfileMenu();if($("#page-community")?.classList.contains("active"))loadNotifications();},12000);
  const oldOpenDetail=window.openDetail;
  if(typeof openDetail==="function"){
    const original=openDetail;
    openDetail=function(id){original(id);const p=(players||[]).find(x=>x.id===id);if(p&&$("#detailContent"))appendCareerToProfile(p);};
  }
  function appendCareerToProfile(p){
    const target=$("#detailContent");if(!target||target.querySelector(".acs-career-inline"))return;
    const node=document.createElement("section");node.className="detail-section acs-career-inline";
    node.innerHTML='<h3>Conquistas</h3><p class="detail-bio">Confira as medalhas e os objetivos da carreira deste jogador.</p><button class="btn btn-ghost btn-small" data-open-achievements>Ver conquistas →</button>';
    target.append(node);
    node.querySelector("[data-open-achievements]").addEventListener("click",()=>openAchievementPage(p));
  }
  async function openAchievementPage(p){
    const target=$("#detailContent");if(!target||!p)return;
    let matches=Number(p.matches||0),kills=Number(p.kills||0),assists=Number(p.assists||0),mvps=Number(p.mvps||0);
    if(supabaseClient){
      const {data,error}=await supabaseClient.from("player_match_stats").select("kills,deaths,assists,mvps").eq("player_id",p.id).limit(1000);
      if(!error&&data){
        matches=Math.max(matches,data.length);
        kills=Math.max(kills,data.reduce((n,r)=>n+Number(r.kills||0),0));
        assists=Math.max(assists,data.reduce((n,r)=>n+Number(r.assists||0),0));
        mvps=Math.max(mvps,data.reduce((n,r)=>n+Number(r.mvps||0),0));
      }
    }
    const rating=Number(p.rating||0),win=Number(p.win||0),kd=Number(p.kd||0),adr=Number(p.adr||0),hs=Number(p.hs||0);
    const items=[
      ["🎯","1st KILL","Consiga sua primeira eliminação em uma partida oficial.",kills>=1],
      ["🔫","Primeiros 10 abates","Registre 10 eliminações.",kills>=10],
      ["💥","Aquecendo a mira","Registre 25 eliminações.",kills>=25],
      ["☠️","Pequeno massacre","Registre 50 eliminações.",kills>=50],
      ["🤝","Primeira assistência","Contribua com sua primeira assistência.",assists>=1],
      ["🫱‍🫲","Bom companheiro","Registre 5 assistências.",assists>=5],
      ["🛡️","Jogo coletivo","Registre 10 assistências.",assists>=10],
      ["⭐","Suporte presente","Registre 25 assistências.",assists>=25],
      ["🏅","Primeiro MVP","Conquiste seu primeiro MVP.",mvps>=1],
      ["⚔️","Primeiro confronto","Dispute sua primeira partida oficial.",matches>=1],
      ["🎯","Veterano","Alcance 10 partidas oficiais.",matches>=10],
      ["💀","Centenário","Registre 100 eliminações.",kills>=100],
      ["🏅","Jogador decisivo","Conquiste 5 MVPs.",mvps>=5],
      ["🔥","Alta performance","Alcance 60% de win rate com pelo menos 5 partidas.",win>=60&&matches>=5],
      ["👑","Elite ACS","Alcance Rating AM de 80.",rating>=80],
      ["🧭","Rosto conhecido","Dispute 5 partidas oficiais.",matches>=5],
      ["🛡️","Presença constante","Dispute 25 partidas oficiais.",matches>=25],
      ["🏟️","Lenda dos servidores","Dispute 50 partidas oficiais.",matches>=50],
      ["🎯","Caçador de eliminações","Registre 250 eliminações.",kills>=250],
      ["💥","Máquina de abates","Registre 500 eliminações.",kills>=500],
      ["☠️","Exterminador","Registre 1.000 eliminações.",kills>=1000],
      ["🌋","Força imparável","Registre 2.500 eliminações.",kills>=2500],
      ["🥉","Destaque da rodada","Conquiste 10 MVPs.",mvps>=10],
      ["🥈","Protagonista","Conquiste 25 MVPs.",mvps>=25],
      ["🥇","Rei dos MVPs","Conquiste 50 MVPs.",mvps>=50],
      ["📈","Rating em ascensão","Alcance Rating AM de 90.",rating>=90],
      ["🚀","Dominância","Alcance 70% de win rate com pelo menos 10 partidas.",win>=70&&matches>=10],
      ["⚖️","Consistência positiva","Mantenha K/D de pelo menos 1,50.",kd>=1.5],
      ["💎","Superioridade","Mantenha K/D de pelo menos 2,00.",kd>=2],
      ["🔫","Dano consistente","Alcance 80 de ADR médio.",adr>=80],
      ["💣","Alto impacto","Alcance 90 de ADR médio.",adr>=90],
      ["🧨","Dano absurdo","Alcance 100 de ADR médio.",adr>=100],
      ["🎯","Mira afiada","Alcance 50% de HS.",hs>=50],
      ["🦅","Precisão cirúrgica","Alcance 65% de HS.",hs>=65]
    ];
    const unlocked=items.filter(x=>x[3]).length;
    target.innerHTML='<div class="modal-head"><div><span class="eyebrow">PLAYER PROFILE / ACHIEVEMENTS</span><h2>Conquistas de '+esc(p.nickname)+'</h2><p class="detail-bio">'+unlocked+' de '+items.length+' conquistas desbloqueadas</p></div><button class="icon-button" id="backToPlayerProfile" aria-label="Voltar ao perfil">←</button></div><div class="achievement-grid">'+items.map(x=>achievementMarkup(x[0],x[1],x[2],x[3])).join("")+'</div>';
    $("#backToPlayerProfile")?.addEventListener("click",()=>openDetail(p.id));
  }
  const oldGo=go;
  go=function(page){oldGo(page);if(page==="community")loadCommunity();};
  refreshProfileMenu();
  setTimeout(refreshProfileMenu,500);
  setTimeout(refreshProfileMenu,1800);
  window.ACS9Community={refresh:loadCommunity,refreshProfile:refreshProfileMenu,openTeam:openTeamDetail};
})();
