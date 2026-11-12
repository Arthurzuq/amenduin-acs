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
    let matchCount=Number(p.matches||0),kills=Number(p.kills||0),mvps=Number(p.mvps||0),rating=Number(p.rating||0),win=Number(p.win||0);
    if(supabaseClient){
      const {data}=await supabaseClient.from("player_match_stats").select("match_id,kills,deaths,mvps,matches(played_at,team_a_name,team_b_name,team_a_score,team_b_score,status)").eq("player_id",p.id).order("match_id",{ascending:false}).limit(100);
      careerRows=data||[];
      if(careerRows.length){matchCount=Math.max(matchCount,careerRows.length);kills=Math.max(kills,careerRows.reduce((a,r)=>a+Number(r.kills||0),0));mvps=Math.max(mvps,careerRows.reduce((a,r)=>a+Number(r.mvps||0),0));}
    }
    const ach=[
      achievementMarkup("⚔️","Primeiro confronto","Dispute sua primeira partida oficial.",matchCount>=1),
      achievementMarkup("🎯","Veterano","Alcance 10 partidas oficiais.",matchCount>=10),
      achievementMarkup("💀","Centenário","Registre 100 eliminações.",kills>=100),
      achievementMarkup("🏅","Jogador decisivo","Conquiste 5 MVPs.",mvps>=5),
      achievementMarkup("🔥","Alta performance","Alcance 60% de win rate com pelo menos 5 partidas.",win>=60&&matchCount>=5),
      achievementMarkup("👑","Elite ACS","Alcance Rating AM de 80.",rating>=80)
    ];
    host.innerHTML='<div class="community-item community-career-summary"><div><b>'+esc(p.nickname)+'</b><small>'+matchCount+' partidas · '+kills+' kills · '+mvps+' MVPs</small></div><button data-career-profile>Ver perfil completo</button></div><div class="achievement-grid">'+ach.join("")+'</div><div class="detail-section"><h3>Partidas recentes</h3><div class="community-list">'+(careerRows.length?careerRows.slice(0,8).map(r=>{const m=r.matches||{};return '<article class="community-item"><div><b>'+esc(m.team_a_name||"Equipe A")+' vs '+esc(m.team_b_name||"Equipe B")+'</b><small>'+fmtDate(m.played_at)+' · '+Number(r.kills||0)+' / '+Number(r.deaths||0)+' / '+Number(r.assists||0)+'</small></div><span>'+(m.status==="completed"?"Concluída":"Registrada")+'</span></article>';}).join(""):'<div class="community-empty">O histórico detalhado aparecerá após suas próximas partidas oficiais.</div>')+'</div></div>';
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
    const [{data:members},{data:matches}]=await Promise.all([
      supabaseClient.from("team_members").select("player_id,role,players(id,nickname,main_role,avatar_url)").eq("team_id",team.id),
      supabaseClient.from("matches").select("id,played_at,team_a_name,team_b_name,team_a_score,team_b_score,status").or("team_a_id.eq."+team.id+",team_b_id.eq."+team.id).eq("status","completed").order("played_at",{ascending:false}).limit(10)
    ]);
    let modal=$("#acsTeamDetailModal");
    if(!modal){modal=document.createElement("div");modal.id="acsTeamDetailModal";modal.className="modal-backdrop";modal.innerHTML='<div class="modal detail-modal"><div id="acsTeamDetailContent"></div></div>';document.body.append(modal);modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-team-close]"))modal.classList.remove("open");});}
    const roster=members||[],history=matches||[];
    $("#acsTeamDetailContent").innerHTML='<div class="modal-head"><div><span class="eyebrow">TEAM PROFILE</span><h2>'+esc(team.name)+'</h2></div><button class="icon-button" data-team-close>×</button></div><section class="detail-section"><h3>Elenco atual</h3><div class="team-detail-roster">'+(roster.length?roster.map(m=>'<button data-team-player="'+esc(m.player_id)+'"><b>'+esc(m.players?.nickname||"Jogador")+'</b><small>'+esc(m.role==="captain"?"Capitão":m.players?.main_role||"Integrante")+'</small></button>').join(""):'<p class="muted">Nenhum integrante cadastrado.</p>')+'</div></section><section class="detail-section"><h3>Últimos resultados</h3><div class="community-list">'+(history.length?history.map(m=>'<article class="community-item"><div><b>'+esc(m.team_a_name)+' '+m.team_a_score+' × '+m.team_b_score+' '+esc(m.team_b_name)+'</b><small>'+fmtDate(m.played_at)+'</small></div></article>').join(""):'<p class="muted">Ainda não há partidas concluídas registradas para esta equipe.</p>')+'</div></section>';
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
  $("#acsCommunityRefresh")?.addEventListener("click",loadCommunity);
  const oldUpdateAuthButton=window.updateAuthButton;
  // Keep the profile shortcut synchronized with cloud profile hydration and auth transitions.
  const observer=new MutationObserver(()=>refreshProfileMenu());
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
  setInterval(()=>{refreshProfileMenu();if($("#page-community")?.classList.contains("active"))loadNotifications();},12000);
  const oldOpenDetail=window.openDetail;
  if(typeof openDetail==="function"){
    const original=openDetail;
    openDetail=function(id){original(id);const p=(players||[]).find(x=>x.id===id);if(p&&$("#detailContent"))appendCareerToProfile(p);};
  }
  function appendCareerToProfile(p){
    const target=$("#detailContent");if(!target||target.querySelector(".acs-career-inline"))return;
    const node=document.createElement("section");node.className="detail-section acs-career-inline";node.innerHTML='<h3>Carreira ACS</h3><p class="detail-bio">'+Number(p.matches||0)+' partidas · '+Number(p.kills||0)+' eliminações · '+Number(p.mvps||0)+' MVPs</p><button class="text-button" data-open-career>Ver conquistas e histórico →</button>';target.append(node);
    node.querySelector("[data-open-career]").addEventListener("click",()=>{go("community");renderCareer();});
  }
  const oldGo=go;
  go=function(page){oldGo(page);if(page==="community")loadCommunity();};
  refreshProfileMenu();
  setTimeout(refreshProfileMenu,500);
  setTimeout(refreshProfileMenu,1800);
  window.ACS9Community={refresh:loadCommunity,refreshProfile:refreshProfileMenu,openTeam:openTeamDetail};
})();
