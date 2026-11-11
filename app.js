const STORAGE_KEY = "acs_players_v1";
// Perfis demonstrativos removidos: o ACS agora exibe apenas jogadores reais do Supabase.
let players = loadPlayers();
function loadPlayers(){
  try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
    const real=(Array.isArray(saved)?saved:[]).filter(p=>p&&!p.demo&&!String(p.id||"").startsWith("demo-"));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(real));return real;
  }catch(e){localStorage.removeItem(STORAGE_KEY);return []}
}
function savePlayers(){localStorage.setItem(STORAGE_KEY,JSON.stringify(players))}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const initials = n => (n||"?").slice(0,2).toUpperCase();
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleShort = r => r==="Entry-Fragger"?"ENTRY":r==="Support"?"SUPPORT":r==="AWPer"?"AWPER":r==="Lurker"?"LURKER":r==="Rifler"?"RIFLER":"IGL";
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function go(page){$$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));$$(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));$("#crumb").textContent=({home:"VISÃO GERAL",players:"JOGADORES",rankings:"RANKINGS",matches:"PARTIDAS",teams:"EQUIPES",market:"MERCADO"})[page]||page.toUpperCase();$(".sidebar").classList.remove("open");if(page==="players")renderPlayers();if(page==="rankings")renderRanking();if(page==="matches"){loadMatches();renderPublicStats();if(isAdmin){renderMatchPlayerRows();renderMapEditors();$("#matchesAdminPanel").style.display="block";loadTeamsData();}}if(page==="market")loadMarketData();if(page==="teams")loadTeamsData();window.scrollTo(0,0)}
$$("[data-page]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();go(a.dataset.page)}));
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));
$("#mobileMenu").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
function openForm(p=null){$("#playerForm").reset();$("#editId").value=p?.id||"";$("#modalTitle").textContent=p?"EDITAR PERFIL":"CRIAR PERFIL";if(p){$("#nickname").value=p.nickname;$("#steam").value=p.steam||"";$("#country").value=p.country||"Brasil";$("#mainRole").value=p.mainRole;$("#secondaryRole").value=p.secondaryRole||"";$("#marketStatus").value=p.marketStatus||"Disponível";$("#bio").value=p.bio||"";}$("#profileModal").classList.add("open")}
function closeForm(){$("#profileModal").classList.remove("open")}
["#newPlayerTop","#createFromHero","#createFromPanel","#newPlayerList"].forEach(s=>$(s)?.addEventListener("click",()=>openForm()));
$("#closeModal").addEventListener("click",closeForm);$("#cancelModal").addEventListener("click",closeForm);
$("#profileModal").addEventListener("click",e=>{if(e.target.id==="profileModal")closeForm()});
$("#playerForm").addEventListener("submit",e=>{e.preventDefault();const editId=$("#editId").value;const nickname=$("#nickname").value.trim();if(!nickname)return;const duplicate=players.find(p=>p.nickname.toLowerCase()===nickname.toLowerCase()&&p.id!==editId);if(duplicate){toast("Esse nickname já está cadastrado.");return}
const existing=players.find(p=>p.id===editId);const p={...(existing||{}),id:editId||`p-${Date.now()}`,nickname,steam:$("#steam").value.trim(),country:$("#country").value,mainRole:$("#mainRole").value,secondaryRole:$("#secondaryRole").value,team:existing?.team||"Sem equipe",marketStatus:$("#marketStatus").value,bio:$("#bio").value.trim(),rating:existing?.rating??null,kd:existing?.kd??null,adr:existing?.adr??null,hs:existing?.hs??null,win:existing?.win??null,matches:existing?.matches??0,mvps:existing?.mvps??0,kills:existing?.kills??0,deaths:existing?.deaths??0,firstKills:existing?.firstKills??0,firstDeaths:existing?.firstDeaths??0,clutches:existing?.clutches??0,teamHistory:existing?.teamHistory||[],demo:false};
if(existing){players=players.map(x=>x.id===editId?p:x)}else players.unshift(p);savePlayers();closeForm();renderAll();toast(existing?"Perfil atualizado.":"Perfil criado com sucesso!")});
function playerCard(p){return `<article class="player-card" data-open="${safe(p.id)}"><div class="card-top"><div class="avatar">${safe(initials(p.nickname))}</div><div class="card-identity"><b>${safe(p.nickname)}</b><small>${safe(p.team||"Sem equipe")} · ${safe(p.country||"")}</small></div><span class="rating-mini">${p.rating??"—"}<small>RATING AM</small></span></div><span class="role-tag">${safe(roleShort(p.mainRole))}</span><div class="card-stats"><div><strong>${p.kd??"N/A"}</strong><small>K/D</small></div><div><strong>${p.adr??"N/A"}</strong><small>ADR</small></div><div><strong>${p.win==null?"N/A":p.win+"%"}</strong><small>WIN RATE</small></div></div></article>`}
function bindPlayerCards(){ $$("[data-open]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.open)))}
function renderPlayers(){const q=$("#playerSearch").value.toLowerCase();const role=$("#roleFilter").value;let list=players.filter(p=>(p.nickname.toLowerCase().includes(q)||(p.team||"").toLowerCase().includes(q))&&(!role||p.mainRole===role));const sort=$("#sortPlayers").value;if(sort==="rating")list.sort((a,b)=>(b.rating??-1)-(a.rating??-1));else if(sort==="kd")list.sort((a,b)=>(b.kd??-1)-(a.kd??-1));else if(sort==="win")list.sort((a,b)=>(b.win??-1)-(a.win??-1));else list.sort((a,b)=>a.nickname.localeCompare(b.nickname));$("#playersGrid").innerHTML=list.length?list.map(playerCard).join(""):`<div class="empty-state" style="grid-column:1/-1"><div class="empty-symbol">⌕</div><h3>Nenhum jogador encontrado</h3><p>Tente alterar a pesquisa ou os filtros.</p></div>`;bindPlayerCards()}
["#playerSearch","#roleFilter","#sortPlayers"].forEach(s=>$(s).addEventListener("input",renderPlayers));
function openDetail(id){const p=players.find(x=>x.id===id);if(!p)return;$("#detailContent").innerHTML=`<div class="modal-head"><span class="eyebrow">PLAYER PROFILE / ACS</span><button class="icon-button" id="closeDetail">×</button></div><div class="detail-hero"><div class="avatar">${p.avatarUrl?`<img src="${safe(p.avatarUrl)}" alt="Foto de ${safe(p.nickname)}">`:safe(initials(p.nickname))}</div><div><h2>${safe(p.nickname)}</h2><p>${safe(p.team||"Sem equipe")} · ${safe(p.country||"Brasil")}</p><span class="role-tag">${safe(p.mainRole)}${p.secondaryRole?" / "+safe(p.secondaryRole):""}</span></div><div class="detail-rating">${p.rating??"—"}<small>RATING AM</small></div></div><div class="detail-section"><h3>Estatísticas gerais</h3><div class="detail-stats">${stat("PARTIDAS",p.matches??0)}${stat("K/D",p.kd??"N/A")}${stat("ADR",p.adr??"N/A")}${stat("HS%",p.hs==null?"N/A":p.hs+"%")}${stat("WIN RATE",p.win==null?"N/A":p.win+"%")}${stat("MVPs",p.mvps??0)}${stat("FIRST KILLS",p.firstKills??"N/A")}${stat("CLUTCHES",p.clutches??"N/A")}</div></div><div class="detail-section"><h3>Perfil competitivo</h3><p class="detail-bio">${safe(p.bio||"Este jogador ainda não adicionou uma biografia.")}</p><p class="detail-bio"><b>Status no mercado:</b> ${safe(p.marketStatus||"Não informado")}</p><p class="detail-bio"><b>Steam:</b> ${p.steam?`<a href="${safe(p.steam)}" target="_blank" rel="noopener" style="color:#8cc3ff">Abrir perfil Steam ↗</a>`:"Não informado"}</p></div><div class="detail-section"><h3>Histórico competitivo</h3><p class="detail-bio">${"Estatísticas oficiais são atualizadas pela administração da Liga Amenduin."}</p></div><div class="detail-actions">${(currentUser&&p.userId===currentUser.id)?'<button class="btn btn-primary" id="editPlayer">Editar perfil</button>':""}</div>`;$("#detailModal").classList.add("open");$("#closeDetail").addEventListener("click",()=>$("#detailModal").classList.remove("open"));$("#editPlayer")?.addEventListener("click",()=>{const current=players.find(x=>x.id===id);$("#detailModal").classList.remove("open");openForm(current)})}
function stat(label,value){return `<div class="detail-stat"><b>${safe(value)}</b><small>${label}</small></div>`}
$("#detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")$("#detailModal").classList.remove("open")});
function renderHome(){const real=players;$("#totalPlayers").textContent=players.length;$("#totalTeams").textContent=0;$("#totalMatches").textContent=players.reduce((n,p)=>n+(p.matches||0),0);$("#featuredCount").textContent=players.filter(p=>p.rating!=null).length;const list=[...players].sort((a,b)=>(b.rating??-1)-(a.rating??-1)).slice(0,4);$("#featuredPlayers").innerHTML=list.length?list.map(p=>`<div class="player-row" data-open="${safe(p.id)}"><div class="avatar">${safe(initials(p.nickname))}</div><div class="player-main"><b>${safe(p.nickname)}</b><small>${safe(p.mainRole)} · ${safe(p.team)}</small></div><div class="rating-mini">${p.rating??"—"}<small>RATING AM</small></div></div>`).join(""):`<p class="muted">Ainda não há jogadores cadastrados.</p>`;bindPlayerCards()}
function renderRanking(){const list=[...players].filter(p=>p.rating!=null).sort((a,b)=>b.rating-a.rating);$("#rankingList").innerHTML=list.length?list.map((p,i)=>`<div class="rank-row"><div class="rank-number">#${String(i+1).padStart(2,"0")}</div><div><b>${safe(p.nickname)}</b><div class="rank-bar"><i style="width:${Math.max(0,Math.min(100,p.rating))}%"></i></div></div><div class="muted small">${safe(p.mainRole)}</div><div class="rank-value">${p.rating}</div></div>`).join(""):`<div class="empty-state"><h3>Sem dados suficientes</h3><p>Os rankings aparecerão quando houver jogadores com avaliações registradas.</p></div>`}
function renderAll(){renderHome();renderPlayers();renderRanking()}
renderAll();


// ---- Optional Supabase authentication and cloud profile persistence ----
let supabaseClient = null;
let authMode = "login";
let currentUser = null;
let isAdmin = false;
function supabaseReady(){
  return !!(window.supabase && window.ACS_SUPABASE_URL && window.ACS_SUPABASE_ANON_KEY &&
    window.ACS_SUPABASE_URL.startsWith("https://") && window.ACS_SUPABASE_ANON_KEY.length > 20);
}
if(supabaseReady()){
  supabaseClient = window.supabase.createClient(window.ACS_SUPABASE_URL,window.ACS_SUPABASE_ANON_KEY);
  initCloudAuth();
}
async function initCloudAuth(){
  const {data:{session}} = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  updateAuthButton();
  await loadCloudPlayers();
  await loadTeamsData();
  await refreshAdminStatus();
  supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
    currentUser=session?.user||null;
    updateAuthButton();
    await loadCloudPlayers();
    await loadTeamsData();
    await refreshAdminStatus();
    if(document.querySelector("#page-market.active")) await loadMarketData();
    if(document.querySelector("#page-teams.active")) await loadTeamsData();
  });
}
function updateAuthButton(){
  const b=$("#authButton");
  if(!b)return;
  b.textContent=currentUser?(currentUser.email.split("@")[0]):"Entrar";
  b.classList.toggle("user-pill",!!currentUser);
  b.title=currentUser?"Clique para sair":"Entrar ou criar conta";
  const adminLink=document.querySelector('[data-page="admin"]');if(adminLink)adminLink.style.display=currentUser?"flex":"none";
}
$("#authButton")?.addEventListener("click",async()=>{
  if(currentUser && supabaseClient){
    const {error}=await supabaseClient.auth.signOut();
    if(error)toast("Não foi possível sair: "+error.message);
    else {currentUser=null;isAdmin=false;updateAuthButton();toast("Você saiu da conta.");}
  }else{
    $("#authModal").classList.add("open");
  }
});
$("#closeAuth")?.addEventListener("click",()=>$("#authModal").classList.remove("open"));
$("#authModal")?.addEventListener("click",e=>{if(e.target.id==="authModal")$("#authModal").classList.remove("open")});
$("#toggleAuthMode")?.addEventListener("click",()=>{
  authMode=authMode==="login"?"signup":"login";
  $("#authTitle").textContent=authMode==="login"?"ENTRAR NA CONTA":"CRIAR CONTA";
  $("#authSubmit").textContent=authMode==="login"?"Entrar ↗":"Criar conta ↗";
  $("#toggleAuthMode").textContent=authMode==="login"?"Criar conta":"Já tenho conta";
  $("#authHint").textContent=authMode==="signup"?"Após o cadastro, confirme seu e-mail caso a confirmação esteja habilitada no Supabase.":"Use seu e-mail e senha para entrar.";
});
$("#authForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabaseClient){toast("Autenticação online ainda não configurada. Consulte o README.");return;}
  const email=$("#authEmail").value.trim(),password=$("#authPassword").value;
  $("#authSubmit").disabled=true;
  try{
    const result=authMode==="signup"
      ? await supabaseClient.auth.signUp({email,password})
      : await supabaseClient.auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    if(authMode==="signup"&&!result.data.session){
      toast("Conta criada. Verifique seu e-mail para confirmar.");
    }else{
      currentUser=result.data.user;updateAuthButton();toast("Login realizado.");
      await loadCloudPlayers();
      await loadTeamsData();
    }
    $("#authModal").classList.remove("open");
  }catch(err){toast(err.message||"Erro de autenticação.");}
  finally{$("#authSubmit").disabled=false;}
});
async function loadCloudPlayers(){
  if(!supabaseClient)return;
  const {data,error}=await supabaseClient.from("players").select("*").order("nickname");
  if(error){toast("Erro ao carregar perfis online.");return;}
  const cloud=(data||[]).map(p=>({
    id:p.id,nickname:p.nickname,steam:p.steam_url||"",country:p.country,mainRole:p.main_role,
    secondaryRole:p.secondary_role||"",team:p.team_name,marketStatus:p.market_status,bio:p.bio||"",userId:p.user_id,avatarUrl:p.avatar_url||null,profileFrameColor:p.profile_frame_color||"blue",profileBackground:p.profile_background||"blue",profileNameColor:p.profile_name_color||"white",
    rating:null,kd:null,adr:null,hs:null,win:null,matches:0,mvps:0,kills:0,deaths:0,
    firstKills:0,firstDeaths:0,clutches:0,teamHistory:[],demo:false
  }));
  // When logged in, the cloud database is authoritative for real profiles.
  const {data:statsData,error:statsError}=await supabaseClient.from("player_competitive_stats").select("*");
  if(statsError && statsError.code!=="42P01") console.warn("ACS stats:",statsError.message);
  const statsByPlayer=new Map((statsData||[]).map(st=>[st.player_id,st]));
  players=cloud.map(p=>{const st=statsByPlayer.get(p.id)||{};return {...p,
    rating:st.rating_am??null,kd:st.kd??null,adr:st.adr??null,hs:st.headshot_pct??null,win:st.win_rate??null,
    matches:st.matches??0,mvps:st.mvps??0,kills:st.kills??0,deaths:st.deaths??0,
    firstKills:st.first_kills??0,firstDeaths:st.first_deaths??0,clutches:st.clutches??0};});
  savePlayers();renderAll();renderPublicStats();if(isAdmin){renderAdminPanel();renderMatchPlayerRows();renderMapEditors();renderMatchTeamSelectors();}
  const matchAdmin=document.querySelector("#matchesAdminPanel");if(matchAdmin)matchAdmin.style.display=isAdmin?"block":"none";
}
const originalPlayerSubmit=$("#playerForm").onsubmit;
$("#playerForm").addEventListener("submit",async()=>{
  if(!supabaseClient||!currentUser)return;
  // The local save handler remains useful in demo mode; cloud writes happen for signed-in users.
  const nickname=$("#nickname").value.trim();
  const payload={
    user_id:currentUser.id,nickname,steam_url:$("#steam").value.trim()||null,
    country:$("#country").value,main_role:$("#mainRole").value,
    secondary_role:$("#secondaryRole").value||null,
    market_status:$("#marketStatus").value,bio:$("#bio").value.trim()||null
  };
  const editId=$("#editId").value;
  let query;
  if(editId && !editId.startsWith("p-") && !editId.startsWith("demo-")){
    query=supabaseClient.from("players").update(payload).eq("id",editId).eq("user_id",currentUser.id);
  }else{
    query=supabaseClient.from("players").insert(payload);
  }
  const {error}=await query;
  if(error)toast("Perfil salvo localmente, mas falhou ao sincronizar: "+error.message);
  else await loadCloudPlayers();
});


// ---- ACS Market: public listings and authenticated player-to-player offers ----
let marketOffers = [];
function currentPlayerProfile(){return currentUser?players.find(p=>!p.demo&&p.userId===currentUser.id):null;}
function renderMarket(){
  const listings=players.filter(p=>p.userId&&["Disponível","Negociável","Livre","Em negociação"].includes(p.marketStatus));
  $("#marketCount").textContent=`${listings.length} jogador${listings.length===1?"":"es"}`;
  const own=currentPlayerProfile();
  $("#marketAccountHint").textContent=!supabaseClient
    ? "O Mercado online precisa da conexão com o Supabase configurada."
    : !currentUser
      ? "Você está navegando como visitante. Entre na sua conta e vincule seu perfil para enviar propostas."
      : !own
        ? "Sua conta ainda não possui um perfil de jogador vinculado. Crie seu perfil para participar das negociações."
        : `Conectado como ${own.nickname}. Você pode enviar propostas usando o perfil ${own.nickname}.`;
  $("#marketPlayers").innerHTML=listings.length?listings.map(p=>{
    const isSelf=own&&own.id===p.id;
    return `<div class="market-player"><div class="avatar">${safe(initials(p.nickname))}</div><div class="market-player-info"><b>${safe(p.nickname)}</b><small>${safe(p.mainRole)} · ${safe(p.team||"Sem equipe")}</small><span class="market-status">${safe(p.marketStatus)}</span></div>${isSelf?'<span class="muted small">Seu perfil</span>':`<button class="btn btn-primary btn-small" data-make-offer="${safe(p.id)}" ${!own?"disabled":""}>Propor transferência</button>`}</div>`;
  }).join(""):`<div class="market-empty"><b>Nenhum jogador no mercado</b>Quando jogadores cadastrados marcarem seus perfis como disponíveis ou negociáveis, eles aparecerão aqui.</div>`;
  const offers=marketOffers.map(o=>{
    const target=players.find(p=>p.id===o.target_player_id);
    const proposer=players.find(p=>p.id===o.offered_by_player_id);
    const incoming=!!(currentUser&&target?.userId===currentUser.id);
    const statusLabels={pending:"Aguardando resposta",accepted:"Aceita",rejected:"Recusada",cancelled:"Cancelada"};
    const actions=o.status==="pending"?(incoming?`<button class="btn btn-primary" data-offer-action="accept" data-offer-id="${o.id}">Aceitar</button><button class="btn btn-ghost" data-offer-action="reject" data-offer-id="${o.id}">Recusar</button>`:`<button class="btn btn-ghost" data-offer-action="cancel" data-offer-id="${o.id}">Cancelar proposta</button>`):"";
    return `<article class="offer-card"><div class="offer-card-head"><b>${incoming?`Proposta para ${safe(target?.nickname||"jogador")}`:`Sua proposta para ${safe(target?.nickname||"jogador")}`}</b><span class="offer-status">${statusLabels[o.status]||safe(o.status)}</span></div><p><b>${safe(proposer?.nickname||"Jogador")}</b> · ${safe(proposer?.team||"Sem equipe")}<br>${safe(o.message||"Sem mensagem adicional.")}</p><div class="offer-actions">${actions}</div></article>`;
  });
  $("#myOffers").innerHTML=offers.length?offers.join(""):`<div class="market-empty"><b>Nenhuma proposta ainda</b>As propostas recebidas e enviadas aparecerão nesta área.</div>`;
  $$('[data-make-offer]').forEach(btn=>btn.addEventListener("click",()=>openOffer(btn.dataset.makeOffer)));
  $$('[data-offer-action]').forEach(btn=>btn.addEventListener("click",()=>updateOffer(btn.dataset.offerId,btn.dataset.offerAction)));
}
async function loadMarketData(){
  renderMarket();
  if(!supabaseClient||!currentUser){marketOffers=[];renderMarket();return;}
  const {data,error}=await supabaseClient.from("transfer_offers").select("*").order("created_at",{ascending:false});
  if(error){marketOffers=[];renderMarket();if(error.code!=="42P01")toast("Não foi possível carregar propostas: "+error.message);return;}
  marketOffers=data||[];renderMarket();
}
function openOffer(targetId){
  if(!currentUser){$("#authModal").classList.add("open");return;}
  const own=currentPlayerProfile(),target=players.find(p=>p.id===targetId);
  if(!own){toast("Crie seu perfil de jogador antes de enviar propostas.");return;}
  if(!own.team||own.team==="Sem equipe"){toast("Entre em uma equipe antes de enviar propostas de transferência.");return;}
  if(!target||target.id===own.id){toast("Esse jogador não pode receber esta proposta.");return;}if(target.team&&target.team===own.team){toast("Esse jogador já está na sua equipe.");return;}
  $("#offerTargetId").value=target.id;$("#offerTargetName").textContent=`Proposta destinada a ${target.nickname} (${target.team||"Sem equipe"}). Sua equipe: ${own.team||"Sem equipe"}.`;
  $("#offerMessage").value="";$("#offerModal").classList.add("open");
}
$("#closeOffer")?.addEventListener("click",()=>$("#offerModal").classList.remove("open"));
$("#cancelOffer")?.addEventListener("click",()=>$("#offerModal").classList.remove("open"));
$("#offerModal")?.addEventListener("click",e=>{if(e.target.id==="offerModal")$("#offerModal").classList.remove("open")});
$("#offerForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabaseClient||!currentUser){toast("Entre na sua conta para enviar uma proposta.");return;}
  const own=currentPlayerProfile(),targetId=$("#offerTargetId").value;
  if(!own){toast("Sua conta não possui um perfil de jogador.");return;}
  const button=$("#sendOfferButton");button.disabled=true;
  const {error}=await supabaseClient.from("transfer_offers").insert({target_player_id:targetId,offered_by_player_id:own.id,message:$("#offerMessage").value.trim()||null});
  button.disabled=false;
  if(error){toast("Não foi possível enviar a proposta: "+error.message);return;}
  $("#offerModal").classList.remove("open");toast("Proposta enviada.");await loadMarketData();
});
async function updateOffer(id,action){
  const status={accept:"accepted",reject:"rejected",cancel:"cancelled"}[action];if(!status||!supabaseClient)return;
  let error=null;
  if(action==="accept"){
    const result=await supabaseClient.rpc("acs_accept_transfer_offer",{p_offer_id:id});
    error=result.error;
  }else{
    const result=await supabaseClient.from("transfer_offers").update({status,decided_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
    error=result.error;
  }
  if(error){toast("Não foi possível atualizar a proposta: "+error.message);return;}
  toast(action==="accept"?"Proposta aceita. Jogador adicionado ao elenco.":action==="reject"?"Proposta recusada.":"Proposta cancelada.");
  await loadCloudPlayers();await loadMarketData();await loadTeamsData();
}
$("#refreshMarket")?.addEventListener("click",async()=>{await loadCloudPlayers();await loadMarketData();toast("Mercado atualizado.")});


// ---- ACS 3.1: equipes, elencos e convites ----
let cloudTeams = [];
let teamMembers = [];
let teamInvites = [];
function myTeamMembership(){
  const me=currentPlayerProfile();
  return me?teamMembers.find(m=>m.player_id===me.id):null;
}
async function loadTeamsData(){
  if(!supabaseClient){
    $("#teamsAccountHint").textContent="As equipes online precisam da conexão com o Supabase configurada.";
    $("#teamsList").innerHTML='<div class="market-empty"><b>Conexão necessária</b>Configure o Supabase para criar equipes e convidar jogadores.</div>';
    $("#teamIncomingInvites").innerHTML='<div class="market-empty">Os convites aparecerão aqui quando o Supabase estiver conectado.</div>';
    return;
  }
  const requests=[
    supabaseClient.from("teams").select("id,name,tag,captain_player_id,created_at,logo_url,frame_color,name_color").order("created_at",{ascending:false}),
    supabaseClient.from("team_members").select("team_id,player_id,role"),
    currentUser
      ? supabaseClient.from("team_invites").select("id,team_id,invited_player_id,invited_by_player_id,status,created_at").order("created_at",{ascending:false})
      : Promise.resolve({data:[],error:null})
  ];
  const [teamsRes,membersRes,invitesRes]=await Promise.all(requests);
  if(teamsRes.error||membersRes.error||invitesRes.error){
    const err=teamsRes.error||membersRes.error||invitesRes.error;
    $("#teamsList").innerHTML=`<div class="market-empty"><b>Não foi possível carregar as equipes</b>${safe(err.message)}</div>`;
    return;
  }
  cloudTeams=teamsRes.data||[];teamMembers=membersRes.data||[];teamInvites=invitesRes.data||[];
  $("#totalTeams").textContent=cloudTeams.length;
  renderTeams();renderMatchTeamSelectors();loadTeamRankings();
}
function renderTeams(){
  const own=currentPlayerProfile(), membership=myTeamMembership();
  $("#teamsAccountHint").textContent=!currentUser
    ? "Você está como visitante. Entre na conta para criar uma equipe, convidar jogadores ou responder a convites."
    : !own
      ? "Sua conta ainda não tem um perfil de jogador. Crie seu perfil na página Jogadores para participar."
      : membership
        ? `Você está em ${cloudTeams.find(t=>t.id===membership.team_id)?.name||"uma equipe"}. ${membership.role==="captain"?"Como capitão, você pode convidar e remover integrantes.":"Aguarde convites ou fale com o capitão para alterações no elenco."}`
        : "Você ainda não faz parte de uma equipe. Crie a sua ou aguarde um convite.";
  $("#teamCreatePanel").style.display=(currentUser&&own&&!membership)?"block":"none";
  const incoming=teamInvites.filter(i=>i.status==="pending"&&own&&i.invited_player_id===own.id);
  $("#teamIncomingInvites").innerHTML=incoming.length?incoming.map(i=>{
    const team=cloudTeams.find(t=>t.id===i.team_id),captain=players.find(p=>p.id===i.invited_by_player_id);
    return `<article class="offer-card"><div class="offer-card-head"><b>${safe(team?.name||"Equipe")}</b><span class="offer-status">Convite pendente</span></div><p>Convite enviado por <b>${safe(captain?.nickname||"Capitão")}</b>.</p><div class="offer-actions"><button class="btn btn-primary" data-team-invite-response="accept" data-team-invite-id="${i.id}">Aceitar</button><button class="btn btn-ghost" data-team-invite-response="reject" data-team-invite-id="${i.id}">Recusar</button></div></article>`;
  }).join(""):'<div class="market-empty"><b>Nenhum convite recebido</b>Quando alguém convidar você, a solicitação aparecerá aqui.</div>';
  $("#teamCount").textContent=`${cloudTeams.length} equipe${cloudTeams.length===1?"":"s"}`;
  $("#teamsList").innerHTML=cloudTeams.length?cloudTeams.map(team=>{
    const members=teamMembers.filter(m=>m.team_id===team.id), captain=players.find(p=>p.id===team.captain_player_id);
    const isCaptain=!!(membership&&membership.team_id===team.id&&membership.role==="captain");
    const pending=teamInvites.filter(i=>i.team_id===team.id&&i.status==="pending");
    const available=players.filter(p=>p.userId&&p.id!==own?.id&&p.team==="Sem equipe"&&!teamMembers.some(m=>m.player_id===p.id));
    const memberHtml=members.map(m=>{
      const player=players.find(p=>p.id===m.player_id);
      return `<div class="team-member"><div><b>${safe(player?.nickname||"Jogador")}</b><small>${m.role==="captain"?"CAPITÃO":"INTEGRANTE"} · ${safe(player?.mainRole||"")}</small></div>${isCaptain&&m.role!=="captain"?`<button class="btn btn-ghost btn-small" data-team-remove="${m.player_id}">Remover</button>`:""}</div>`;
    }).join("");
    const inviteForm=isCaptain?`<form class="team-invite-form" data-team-invite-form="${team.id}"><select required name="player"><option value="">Selecionar jogador livre...</option>${available.map(p=>`<option value="${p.id}">${safe(p.nickname)} · ${safe(p.mainRole)}</option>`).join("")}</select><button class="btn btn-primary btn-small" type="submit" ${available.length?"":"disabled"}>Convidar</button></form>`:"";
    return `<article class="team-card profile-${safe(team.frame_color||"blue")}"><div class="team-card-head"><div>${team.logo_url?`<img class="team-logo" src="${safe(team.logo_url)}" alt="Logo ${safe(team.name)}">`:""}<span class="eyebrow">${safe(team.tag||"ACS TEAM")}</span><h3 class="name-${safe(team.name_color||"white")}">${safe(team.name)}</h3><p>Capitão: ${safe(captain?.nickname||"Não informado")}</p></div><span class="team-capacity">${members.length} jogador${members.length===1?"":"es"}</span></div><div class="team-roster">${memberHtml||'<p class="muted small">Nenhum integrante listado.</p>'}</div>${inviteForm}${isCaptain&&pending.length?`<p class="form-note">${pending.length} convite(s) aguardando resposta.</p>`:""}${(isCaptain||isAdmin)?`<div class="team-delete-row"><button class="btn btn-danger btn-small" data-team-delete="${team.id}">${isAdmin?"Excluir equipe (admin)":"Excluir equipe"}</button></div>`:""}</article>`;
  }).join(""):'<div class="market-empty"><b>Nenhuma equipe criada</b>Seja o primeiro a montar seu elenco e chamar outros jogadores.</div>';
  $("#teamCreateForm")?.querySelector("button[type=submit]")?.toggleAttribute("disabled",!currentUser||!own||!!membership);
  $$('[data-team-invite-response]').forEach(b=>b.addEventListener("click",()=>respondTeamInvite(b.dataset.teamInviteId,b.dataset.teamInviteResponse)));
  $$('[data-team-delete]').forEach(b=>b.addEventListener("click",()=>deleteTeam(b.dataset.teamDelete)));
  $$('[data-team-remove]').forEach(b=>b.addEventListener("click",()=>removeTeamMember(b.dataset.teamRemove)));
  $$('[data-team-invite-form]').forEach(form=>form.addEventListener("submit",async e=>{
    e.preventDefault();const playerId=new FormData(form).get("player");if(!playerId)return;
    const {error}=await supabaseClient.rpc("acs_invite_player",{p_team_id:form.dataset.teamInviteForm,p_player_id:playerId});
    if(error){toast("Não foi possível enviar o convite: "+error.message);return;}
    toast("Convite enviado!");await loadTeamsData();
  }));
}
function renderMatchTeamSelectors(){
  ["#matchTeamA","#matchTeamB"].forEach((sel,index)=>{const el=$(sel);if(!el)return;const old=el.value;el.innerHTML='<option value="">Selecione a equipe...</option>'+cloudTeams.map(t=>`<option value="${safe(t.id)}">${safe(t.name)}${t.tag?" · "+safe(t.tag):""}</option>`).join("")+'<option value="custom">Equipe avulsa (sem cadastro)</option>';if(cloudTeams.some(t=>t.id===old)||old==="custom")el.value=old;});
}
async function loadTeamRankings(){
 const host=$("#teamRankingList");if(!host||!supabaseClient)return;
 const [rankRes,mapRes]=await Promise.all([supabaseClient.from("acs_team_rankings").select("team_id,name,tag,matches,wins,losses,draws,win_rate,map_diff,rating_am").order("rating_am",{ascending:false}),supabaseClient.from("acs_team_map_stats").select("team_id,map_name,matches,wins,win_rate,round_diff")]);
 if(rankRes.error){host.innerHTML=`<div class="market-empty">Não foi possível carregar o ranking: ${safe(rankRes.error.message)}</div>`;return;}
 const maps=mapRes.data||[],rows=(rankRes.data||[]).filter(t=>t.matches>0);
 host.innerHTML=rows.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>#</th><th>Equipe</th><th>Rating AM</th><th>J</th><th>V</th><th>D</th><th>E</th><th>Win rate</th><th>Mapa forte</th><th>Mapa fraco</th></tr></thead><tbody>${rows.map((t,i)=>{const own=maps.filter(m=>m.team_id===t.team_id&&m.matches>=2).sort((a,b)=>b.win_rate-a.win_rate);const strong=own[0],weak=own[own.length-1];return `<tr><td>${i+1}</td><td><b>${safe(t.name)}</b><small>${safe(t.tag||"")}</small></td><td>${Number(t.rating_am).toFixed(2)}</td><td>${t.matches}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.draws||0}</td><td>${Number(t.win_rate).toFixed(1)}%</td><td>${strong?`${safe(strong.map_name)} · ${Number(strong.win_rate).toFixed(0)}%`:"—"}</td><td>${weak?`${safe(weak.map_name)} · ${Number(weak.win_rate).toFixed(0)}%`:"—"}</td></tr>`}).join("")}</tbody></table></div>`:'<div class="market-empty">Ainda não há equipes com partidas oficiais registradas. O ranking será calculado automaticamente após os primeiros confrontos.</div>';
}
const ACS_MAPS=["Ancient","Anubis","Dust II","Inferno","Mirage","Nuke","Overpass","Train","Vertigo","Cache","Cobblestone","Outro"];
function renderMapEditors(){
 const host=$("#matchMapsEditor");if(!host)return;const format=Number($("#matchBestOf")?.value||1);const wrap=$("#matchMapCountWrap");if(wrap){wrap.style.display=format===1?"none":"block";const sel=$("#matchMapCount");const old=Number(sel.value);const opts=format===3?[2,3]:[3,4,5];sel.innerHTML=opts.map(n=>`<option value="${n}">${n} mapas</option>`).join("");sel.value=opts.includes(old)?String(old):String(format===3?3:5);}const count=format===1?1:Number($("#matchMapCount")?.value||(format===3?3:5));
 host.innerHTML=Array.from({length:count},(_,i)=>`<article class="panel" style="padding:14px;margin:10px 0"><h4>MAPA ${i+1}</h4><div class="form-grid"><label class="field">MAPA<select data-map-key="map_name" required>${ACS_MAPS.map(m=>`<option value="${m}">${m}</option>`).join("")}</select></label><label class="field">LADO INICIAL DA EQUIPE A<select data-map-key="team_a_start_side"><option value="TR">TR</option><option value="CT">CT</option></select></label><label class="field">1º TEMPO — EQUIPE A<input data-map-key="a_first_half" type="number" min="0" max="12" value="6" required></label><label class="field">1º TEMPO — EQUIPE B<input data-map-key="b_first_half" type="number" min="0" max="12" value="6" required></label><label class="field">2º TEMPO — EQUIPE A<input data-map-key="a_second_half" type="number" min="0" max="12" value="6" required></label><label class="field">2º TEMPO — EQUIPE B<input data-map-key="b_second_half" type="number" min="0" max="12" value="6" required></label></div><details style="margin-top:10px"><summary>Prorrogação (preencher somente em 12–12)</summary><p class="form-note">Informe os rounds totais de TR e CT conquistados por cada equipe em todas as prorrogações MR3 disputadas. Ex.: uma prorrogação encerrada em 4–2 tem 4/2 rounds para cada equipe, distribuídos conforme os lados.</p><div class="form-grid"><label class="field">A — TR<input data-map-key="a_ot_tr" type="number" min="0" value="0"></label><label class="field">A — CT<input data-map-key="a_ot_ct" type="number" min="0" value="0"></label><label class="field">B — TR<input data-map-key="b_ot_tr" type="number" min="0" value="0"></label><label class="field">B — CT<input data-map-key="b_ot_ct" type="number" min="0" value="0"></label></div></details><p class="form-note" data-map-preview>Placar final calculado: —</p></article>`).join("");
 host.querySelectorAll("article").forEach(card=>card.querySelectorAll("input,select").forEach(el=>el.addEventListener("input",()=>{const val=k=>Number(card.querySelector(`[data-map-key="${k}"]`)?.value||0);const a=val("a_first_half")+val("a_second_half")+val("a_ot_tr")+val("a_ot_ct"),b=val("b_first_half")+val("b_second_half")+val("b_ot_tr")+val("b_ot_ct");card.querySelector("[data-map-preview]").textContent=`Placar final calculado: ${a} × ${b}`;})));
}
$("#matchBestOf")?.addEventListener("change",()=>{renderMapEditors();renderMatchPlayerRows();});$("#matchMapCount")?.addEventListener("change",()=>{renderMapEditors();renderMatchPlayerRows();});

$("#teamCreateForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!supabaseClient||!currentUser){toast("Entre na sua conta para criar uma equipe.");return;}
  if(!currentPlayerProfile()){toast("Crie seu perfil de jogador antes de criar uma equipe.");return;}
  const button=$("#createTeamButton");button.disabled=true;
  const teamName=$("#newTeamName").value.trim();
  const {data:teamId,error}=await supabaseClient.rpc("acs_create_team",{p_name:teamName,p_tag:$("#newTeamTag").value.trim()||null,p_capacity:null});
  button.disabled=false;
  if(error){toast("Não foi possível criar a equipe: "+error.message);return;}
  const custom={logo_url:$("#newTeamLogo")?.value.trim()||null,frame_color:$("#newTeamFrame")?.value||"blue",name_color:$("#newTeamNameColor")?.value||"white"};
  if(teamId) await supabaseClient.from("teams").update(custom).eq("id",teamId);
  e.target.reset();toast("Equipe criada. Você é o capitão!");await loadCloudPlayers();await loadTeamsData();
});
async function respondTeamInvite(id,action){
  if(!supabaseClient)return;
  const {error}=await supabaseClient.rpc("acs_respond_team_invite",{p_invite_id:id,p_accept:action==="accept"});
  if(error){toast("Não foi possível responder ao convite: "+error.message);return;}
  toast(action==="accept"?"Você entrou na equipe!":"Convite recusado.");await loadCloudPlayers();await loadTeamsData();
}
async function removeTeamMember(playerId){
  if(!supabaseClient||!confirm("Remover este jogador da equipe?"))return;
  const {error}=await supabaseClient.rpc("acs_remove_team_member",{p_player_id:playerId});
  if(error){toast("Não foi possível remover o jogador: "+error.message);return;}
  toast("Jogador removido do elenco.");await loadCloudPlayers();await loadTeamsData();
}
async function deleteTeam(teamId){
  if(!supabaseClient||(!isAdmin&&!confirm("Excluir esta equipe? Todos os integrantes voltarão a ficar sem equipe. Esta ação não pode ser desfeita.")))return;
  if(isAdmin&&!confirm("ADMINISTRAÇÃO: excluir esta equipe e desvincular todos os integrantes? Esta ação não pode ser desfeita."))return;
  const {error}=await supabaseClient.rpc("acs_delete_team",{p_team_id:teamId});
  if(error){toast("Não foi possível excluir a equipe: "+error.message);return;}
  toast("Equipe excluída. Os jogadores estão sem equipe.");await loadCloudPlayers();await loadTeamsData();
}
$("#refreshTeams")?.addEventListener("click",async()=>{await loadCloudPlayers();await loadTeamsData();toast("Equipes atualizadas.")});


// ---- ACS 3.3: painel administrativo e estatísticas oficiais ----
async function refreshAdminStatus(){
  if(!supabaseClient||!currentUser){isAdmin=false;updateAuthButton();
    const adminLink=document.querySelector('[data-page="admin"]');if(adminLink)adminLink.style.display="none";
    if($("#adminActivationPanel"))$("#adminActivationPanel").style.display="block";
    if($("#adminWorkspace"))$("#adminWorkspace").style.display="none";
    if($("#matchesAdminPanel"))$("#matchesAdminPanel").style.display="none";
    return;
  }
  const {data,error}=await supabaseClient.rpc("acs_is_admin");
  isAdmin=!error&&data===true;updateAuthButton();
  const link=document.querySelector('[data-page="admin"]');if(link)link.style.display="flex";
  $("#adminActivationPanel").style.display=isAdmin?"none":"block";
  $("#adminWorkspace").style.display=isAdmin?"block":"none";
  $("#matchesAdminPanel").style.display=isAdmin?"block":"none";
  if(isAdmin){renderAdminPanel();renderMatchPlayerRows();renderMapEditors();renderMatchTeamSelectors();}
}
function renderAdminPanel(){
  if(!isAdmin)return;
  const select=$("#adminPlayerSelect");if(!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">Selecione um jogador</option>'+players.map(p=>`<option value="${safe(p.id)}">${safe(p.nickname)}</option>`).join("");
  if(previous&&players.some(p=>p.id===previous))select.value=previous;
  const p=players.find(x=>x.id===select.value);
  const fields={rating_am:p?.rating,kd:p?.kd,adr:p?.adr,headshot_pct:p?.hs,win_rate:p?.win,matches:p?.matches,mvps:p?.mvps,kills:p?.kills,deaths:p?.deaths,first_kills:p?.firstKills,first_deaths:p?.firstDeaths,clutches:p?.clutches};
  Object.entries(fields).forEach(([key,value])=>{const input=$("#stat_"+key);if(input&&document.activeElement!==input)input.value=value??"";});
  $("#adminStatsForm").style.display=p?"grid":"none";
}
$("#adminActivateForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!currentUser||!supabaseClient){toast("Entre na sua conta primeiro.");return;}
  const code=$("#adminCode").value.trim();if(!/^\d{5}$/.test(code)){toast("O código precisa ter 5 dígitos.");return;}
  const btn=$("#adminActivateButton");btn.disabled=true;
  const {data,error}=await supabaseClient.rpc("acs_claim_admin",{p_code:code});btn.disabled=false;
  if(error||data!==true){toast(error?"Não foi possível ativar o painel: "+error.message:"Código incorreto. Confira os cinco dígitos.");return;}
  isAdmin=true;$("#adminCode").value="";$("#adminActivationPanel").style.display="none";$("#adminWorkspace").style.display="block";$("#matchesAdminPanel").style.display="block";updateAuthButton();renderAdminPanel();renderMatchPlayerRows();renderMapEditors();renderMatchTeamSelectors();toast("Acesso administrativo ativado.");
});
$("#adminPlayerSelect")?.addEventListener("change",renderAdminPanel);
$("#adminStatsForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!isAdmin){toast("Acesso administrativo necessário.");return;}
  const playerId=$("#adminPlayerSelect").value;if(!playerId)return;
  const keys=["rating_am","kd","adr","headshot_pct","win_rate","matches","mvps","kills","deaths","first_kills","first_deaths","clutches"];
  const stats={};for(const key of keys){const raw=$("#stat_"+key).value.trim();stats[key]=raw===""?null:Number(raw);}
  const {error}=await supabaseClient.rpc("acs_admin_update_player_stats",{p_player_id:playerId,p_stats:stats});
  if(error){toast("Não foi possível salvar as estatísticas: "+error.message);return;}
  toast("Estatísticas oficiais atualizadas.");await loadCloudPlayers();renderAdminPanel();
});
const adminNav=document.querySelector('[data-page="admin"]');if(adminNav)adminNav.addEventListener("click",()=>{
  if(!currentUser){toast("Entre na sua conta para acessar a administração.");return;}
  $("#adminActivationPanel").style.display=isAdmin?"none":"block";
  $("#adminWorkspace").style.display=isAdmin?"block":"none";
  if(isAdmin){renderAdminPanel();renderMatchPlayerRows();renderMapEditors();renderMatchTeamSelectors();}
  $("#matchesAdminPanel").style.display=isAdmin?"block":"none";
});


// ---- ACS 4.0: registro de partidas oficiais e recálculo competitivo ----
function renderMatchPlayerRows(){
  const host=$("#matchPlayerRows");if(!host||!isAdmin)return;
  const mapCount=Number($("#matchBestOf")?.value||1)===1?1:Number($("#matchMapCount")?.value||($("#matchBestOf")?.value==="3"?3:5));
  host.innerHTML=players.length?players.map(p=>`<div class="match-player-row" data-match-player="${safe(p.id)}">
    <div class="match-player-name"><b>${safe(p.nickname)}</b><small>${safe(p.mainRole)} · ${safe(p.team||"Sem equipe")}</small></div>
    <label class="field">EQUIPE<select data-match-key="team_side"><option value="">Não convocado</option><option value="A">Equipe A</option><option value="B">Equipe B</option></select></label>
    <label class="field">STATUS<select data-match-key="participation_status"><option value="not_played">Não jogou</option><option value="starter" selected>Titular</option><option value="reserve">Reserva</option></select></label>
    <div class="match-player-map-stats">${Array.from({length:mapCount},(_,i)=>`<details class="match-map-player" ${mapCount===1?"open":""}><summary>Mapa ${i+1} — estatísticas individuais</summary><div class="form-grid">
      <label class="field">K<input data-map-stat="${i+1}" data-stat-key="kills" type="number" min="0" max="300" value="0"></label>
      <label class="field">D<input data-map-stat="${i+1}" data-stat-key="deaths" type="number" min="0" max="300" value="0"></label>
      <label class="field">A<input data-map-stat="${i+1}" data-stat-key="assists" type="number" min="0" max="300" value="0"></label>
      <label class="field">ADR<input data-map-stat="${i+1}" data-stat-key="adr" type="number" min="0" max="500" step="0.01" placeholder="—"></label>
      <label class="field">HS%<input data-map-stat="${i+1}" data-stat-key="headshot_pct" type="number" min="0" max="100" step="0.01" placeholder="—"></label>
      <label class="field">MVP<input data-map-stat="${i+1}" data-stat-key="mvps" type="number" min="0" max="10" value="0"></label>
      <label class="field">FK<input data-map-stat="${i+1}" data-stat-key="first_kills" type="number" min="0" max="30" value="0"></label>
      <label class="field">FD<input data-map-stat="${i+1}" data-stat-key="first_deaths" type="number" min="0" max="30" value="0"></label>
      <label class="field">CLUTCH<input data-map-stat="${i+1}" data-stat-key="clutches_won" type="number" min="0" max="20" value="0"></label>
    </div></details>`).join("")}</div>
  </div>`).join(""):`<div class="market-empty">Cadastre jogadores antes de registrar uma partida.</div>`;
}
function renderPublicStats(){
  const host=$("#publicStatsList");if(!host)return;
  const ranked=[...players].filter(p=>p.matches>0||p.rating!=null).sort((a,b)=>(b.rating??-1)-(a.rating??-1));
  host.innerHTML=ranked.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>#</th><th>Jogador</th><th>Rating AM</th><th>Partidas</th><th>K/D</th><th>ADR</th><th>HS%</th><th>Win rate</th></tr></thead><tbody>${ranked.map((p,i)=>`<tr><td>${i+1}</td><td><b>${safe(p.nickname)}</b><small>${safe(p.mainRole||"")}</small></td><td>${p.rating==null?"—":Number(p.rating).toFixed(2)}</td><td>${p.matches||0}</td><td>${p.kd==null?"—":Number(p.kd).toFixed(2)}</td><td>${p.adr==null?"—":Number(p.adr).toFixed(1)}</td><td>${p.hs==null?"—":Number(p.hs).toFixed(1)+"%"}</td><td>${p.win==null?"—":Number(p.win).toFixed(1)+"%"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="market-empty">Ainda não existem estatísticas oficiais. Elas aparecerão aqui após o registro das primeiras partidas.</div>';
}
async function loadPlayerSideStats(){const host=$("#playerSideStats");if(!host||!supabaseClient)return;const {data,error}=await supabaseClient.from("player_side_round_stats").select("player_id,side,rounds_won,rounds_played");if(error){host.innerHTML=`<div class="market-empty">Estatísticas por lado indisponíveis. Execute a migration ACS 4.2.</div>`;return;}const agg={};(data||[]).forEach(r=>{agg[r.player_id]??={TR:[0,0],CT:[0,0]};agg[r.player_id][r.side][0]+=r.rounds_won;agg[r.player_id][r.side][1]+=r.rounds_played;});const rows=Object.entries(agg).map(([id,v])=>({p:players.find(p=>p.id===id),tr:v.TR[1]?100*v.TR[0]/v.TR[1]:null,ct:v.CT[1]?100*v.CT[0]/v.CT[1]:null})).filter(x=>x.p).sort((a,b)=>((b.tr||0)+(b.ct||0))-((a.tr||0)+(a.ct||0)));host.innerHTML=rows.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>Jogador</th><th>Win TR</th><th>Win CT</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${safe(x.p.nickname)}</b></td><td>${x.tr==null?"—":x.tr.toFixed(1)+"%"}</td><td>${x.ct==null?"—":x.ct.toFixed(1)+"%"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="market-empty">As taxas por lado aparecerão após as primeiras partidas registradas nesta versão.</div>';}
let playerMapRows=[];
function renderPlayerMapStats(){
  const host=$("#playerMapStats");if(!host)return;
  const map=$("#playerMapFilter")?.value||"";
  const kd=r=>r.deaths?r.kills/r.deaths:r.kills;
  let rows=playerMapRows.filter(r=>!map||r.map_name===map);
  rows.sort((a,b)=>map?kd(b)-kd(a):String(a.map_name||"").localeCompare(String(b.map_name||""))||kd(b)-kd(a));
  host.innerHTML=rows.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>Jogador</th><th>Mapa</th><th>Partidas</th><th>K/D/A</th><th>K/D</th><th>ADR médio</th><th>HS médio</th><th>MVP</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${safe(players.find(p=>p.id===r.player_id)?.nickname||"Jogador")}</b></td><td>${safe(r.map_name)}</td><td>${r.matches}</td><td>${r.kills}/${r.deaths}/${r.assists}</td><td>${kd(r).toFixed(2)}</td><td>${r.adr==null?"—":Number(r.adr).toFixed(1)}</td><td>${r.headshot_pct==null?"—":Number(r.headshot_pct).toFixed(1)+"%"}</td><td>${r.mvps}</td></tr>`).join("")}</tbody></table></div>`:'<div class="market-empty">As estatísticas por mapa aparecerão depois das primeiras partidas registradas nesta versão.</div>';
}
async function loadPlayerMapStats(){
  const host=$("#playerMapStats");if(!host||!supabaseClient)return;
  const {data,error}=await supabaseClient.from("acs_player_map_stats").select("player_id,map_name,matches,kills,deaths,assists,adr,headshot_pct,mvps").order("map_name");
  if(error){host.innerHTML='<div class="market-empty">Estatísticas por mapa ainda indisponíveis. Execute a migration ACS 4.3.</div>';return;}
  playerMapRows=(data||[]).filter(r=>players.some(p=>p.id===r.player_id));
  const sel=$("#playerMapFilter");
  if(sel){const keep=sel.value;const maps=[...new Set(playerMapRows.map(r=>r.map_name))].sort();sel.innerHTML='<option value="">Todos os mapas</option>'+maps.map(m=>`<option value="${safe(m)}">${safe(m)}</option>`).join("");sel.value=maps.includes(keep)?keep:"";}
  renderPlayerMapStats();
}
$("#playerMapFilter")?.addEventListener("change",renderPlayerMapStats);
async function loadMatches(){
  const host=$("#matchesList");if(!host)return;
  renderPublicStats();
  if(!supabaseClient){host.innerHTML='<div class="market-empty">Conecte o Supabase para consultar o histórico oficial.</div>';return;}
  host.innerHTML='<div class="market-empty">Carregando partidas...</div>';
  const {data,error}=await supabaseClient.from("matches").select("id,played_at,map_name,team_a_name,team_b_name,team_a_score,team_b_score,status,best_of,notes,player_match_stats(player_id,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won,team_side,players(nickname)),match_maps(map_number,map_name,team_a_score,team_b_score,team_a_start_side,a_first_half,b_first_half,a_second_half,b_second_half,a_ot_tr,a_ot_ct,b_ot_tr,b_ot_ct)").eq("status","completed").order("played_at",{ascending:false}).limit(100);
  if(error){host.innerHTML=`<div class="market-empty">Não foi possível carregar partidas: ${safe(error.message)}</div>`;return;}
  await loadPlayerSideStats();
  await loadPlayerMapStats();
  const matches=data||[];$("#matchCount").textContent=`${matches.length} partida${matches.length===1?"":"s"}`;
  host.innerHTML=matches.length?matches.map(m=>{
    const date=m.played_at?new Date(m.played_at).toLocaleString("pt-BR"):"Data não informada";
    const winner=m.team_a_score>m.team_b_score?"A":m.team_b_score>m.team_a_score?"B":"D";
    const ordered=(m.match_maps||[]).slice().sort((a,b)=>a.map_number-b.map_number);
    const dotsA=ordered.map(mm=>`<i class="match-map-dot ${mm.team_a_score>mm.team_b_score?"is-won":""}" title="${safe(mm.map_name)}"></i>`).join("");
    const dotsB=ordered.map(mm=>`<i class="match-map-dot ${mm.team_b_score>mm.team_a_score?"is-won":""}" title="${safe(mm.map_name)}"></i>`).join("");
    return `<article class="match-card match-card-compact" data-match-id="${safe(m.id)}"><div class="match-card-top"><small>${safe(date)} · MD${m.best_of||1}</small>${isAdmin?`<button class="btn btn-danger btn-small" data-delete-match="${safe(m.id)}">Excluir</button>`:""}</div><div class="match-score"><b class="${winner==="A"?"match-winner":""}">${safe(m.team_a_name)}</b><strong>${m.team_a_score} : ${m.team_b_score}</strong><b class="${winner==="B"?"match-winner":""}">${safe(m.team_b_name)}</b></div>${(m.best_of||1)>1?`<div class="match-map-tracks"><div><small>${safe(m.team_a_name)}</small>${dotsA}</div><div><small>${safe(m.team_b_name)}</small>${dotsB}</div></div>`:""}</article>`;
  }).join(""):'<div class="empty-state"><h3>Nenhuma partida registrada</h3><p>Quando a administração cadastrar o primeiro confronto, ele aparecerá aqui.</p></div>';
  $$('[data-delete-match]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm("Excluir esta partida? As estatísticas dos jogadores serão recalculadas sem este confronto."))return;
    const {error}=await supabaseClient.rpc("acs_admin_delete_match",{p_match_id:btn.dataset.deleteMatch});
    if(error){toast("Não foi possível excluir a partida: "+error.message);return;}
    toast("Partida excluída e estatísticas recalculadas.");await loadCloudPlayers();await loadMatches();
  }));
}
$("#refreshMatches")?.addEventListener("click",loadMatches);
$("#adminMatchForm")?.addEventListener("submit",async e=>{
 e.preventDefault();if(!supabaseClient||!isAdmin){toast("Somente administradores podem registrar partidas.");return;}
 const teamA=$("#matchTeamA").value,teamB=$("#matchTeamB").value,bestOf=Number($("#matchBestOf").value);
 if(!teamA||!teamB||teamA===teamB){toast("Selecione duas equipes diferentes.");return;}if(teamA==="custom"&&!$("#customTeamAName").value.trim()||teamB==="custom"&&!$("#customTeamBName").value.trim()){toast("Informe o nome das duas equipes avulsas.");return;}
 const maps=[...$$("#matchMapsEditor > article")].map(card=>{const get=k=>card.querySelector(`[data-map-key="${k}"]`).value;const num=k=>Number(get(k)||0);return {map_name:get("map_name"),team_a_start_side:get("team_a_start_side"),a_first_half:num("a_first_half"),b_first_half:num("b_first_half"),a_second_half:num("a_second_half"),b_second_half:num("b_second_half"),a_ot_tr:num("a_ot_tr"),a_ot_ct:num("a_ot_ct"),b_ot_tr:num("b_ot_tr"),b_ot_ct:num("b_ot_ct")};});
 const playerStats=[];$$("#matchPlayerRows [data-match-player], #matchGuestRows [data-match-guest]").forEach(row=>{const get=k=>row.querySelector(`[data-match-key="${k}"]`).value;const side=get("team_side"),status=get("participation_status");if(!side)return;const mapStats=[...row.querySelectorAll("[data-map-stat]")].reduce((all,input)=>{const n=Number(input.dataset.mapStat);all[n]??={map_number:n};const key=input.dataset.statKey;all[n][key]=input.value===""?null:Number(input.value);return all;},{});const arr=Object.values(mapStats);const sum=k=>arr.reduce((s,x)=>s+(Number(x[k])||0),0);const avg=k=>{const vals=arr.map(x=>x[k]).filter(v=>v!==null&&v!==undefined);return vals.length?vals.reduce((a,b)=>a+Number(b),0)/vals.length:null;};playerStats.push({player_id:row.dataset.matchPlayer||null,player_name:row.dataset.matchGuest?row.querySelector("[data-guest-name]").value.trim():null,team_side:side,participation_status:status,kills:sum("kills"),deaths:sum("deaths"),assists:sum("assists"),adr:avg("adr"),headshot_pct:avg("headshot_pct"),mvps:sum("mvps"),first_kills:sum("first_kills"),first_deaths:sum("first_deaths"),clutches_won:sum("clutches_won"),map_stats:arr});});
 if(!playerStats.length){toast("Selecione os jogadores participantes e suas equipes.");return;}
 const button=$("#saveMatchButton");button.disabled=true;button.textContent="Salvando série...";
 const match={team_a_id:teamA==="custom"?null:teamA,team_b_id:teamB==="custom"?null:teamB,team_a_name:teamA==="custom"?$("#customTeamAName").value.trim():null,team_b_name:teamB==="custom"?$("#customTeamBName").value.trim():null,veto_actions:[...$$("#matchVetoRows .veto-row")].map(row=>({action_type:row.querySelector("[data-veto-key=action]").value,map_name:row.querySelector("[data-veto-key=map]").value,team_id:row.querySelector("[data-veto-key=team]").value==="A"?teamA==="custom"?null:teamA:teamB==="custom"?null:teamB,team_name:row.querySelector("[data-veto-key=team]").value==="A"?(teamA==="custom"?$("#customTeamAName").value.trim():$("#matchTeamA").selectedOptions[0].textContent): (teamB==="custom"?$("#customTeamBName").value.trim():$("#matchTeamB").selectedOptions[0].textContent),starting_side:row.querySelector("[data-veto-key=side]").value||null})),best_of:bestOf,played_at:$("#matchPlayedAt").value?new Date($("#matchPlayedAt").value).toISOString():null,notes:$("#matchNotes").value.trim()};
 let result;try{result=await supabaseClient.rpc("acs_admin_record_series",{p_match:match,p_maps:maps,p_player_stats:playerStats});}catch(err){result={error:err};}
 button.disabled=false;button.textContent="Registrar série e atualizar rankings";
 if(result?.error){toast("Não foi possível registrar: "+(result.error.message||"erro inesperado")+". Confira se as migrations ACS 4.3 e 4.3.1 foram executadas.");return;}
 e.target.reset();localStorage.removeItem("acs5_match_draft_v1");$("#matchGuestRows").innerHTML="";$("#matchMapCount").value="3";renderMapEditors();renderMatchPlayerRows();toast("Série registrada. Estatísticas e rankings atualizados.");await loadCloudPlayers();await loadMatches();await loadTeamsData();renderAdminPanel();
});