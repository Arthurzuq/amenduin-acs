const STORAGE_KEY = "acs_players_v1";
const demoPlayers = [
 {id:"demo-1",nickname:"Vanta",steam:"",country:"Brasil",mainRole:"AWPer",secondaryRole:"Rifler",team:"Nova Ordem",marketStatus:"Intocável",bio:"AWPer de jogo paciente, focado em controle de mapa e impacto nos rounds decisivos.",rating:86,kd:1.31,adr:88.4,hs:54,win:68,matches:22,mvps:5,kills:412,deaths:314,firstKills:48,firstDeaths:21,clutches:7,teamHistory:["Nova Ordem"],demo:true},
 {id:"demo-2",nickname:"Kairo",steam:"",country:"Brasil",mainRole:"Entry-Fragger",secondaryRole:"Rifler",team:"Nova Ordem",marketStatus:"Negociável",bio:"Gosta de criar espaço para a equipe e acelerar execuções. Jogo agressivo.",rating:82,kd:1.18,adr:84.1,hs:61,win:68,matches:22,mvps:3,kills:389,deaths:330,firstKills:67,firstDeaths:42,clutches:4,teamHistory:["Nova Ordem"],demo:true},
 {id:"demo-3",nickname:"Morrow",steam:"",country:"Brasil",mainRole:"IGL",secondaryRole:"Support",team:"Projeto X",marketStatus:"Disponível",bio:"Líder tático, responsável por organizar as chamadas e adaptar o plano durante as partidas.",rating:79,kd:0.98,adr:71.2,hs:47,win:55,matches:18,mvps:2,kills:271,deaths:276,firstKills:18,firstDeaths:24,clutches:5,teamHistory:["Projeto X"],demo:true},
 {id:"demo-4",nickname:"Nox",steam:"",country:"Brasil",mainRole:"Support",secondaryRole:"Lurker",team:"Projeto X",marketStatus:"Negociável",bio:"Prioriza utilidade, trocas e suporte às entradas da equipe.",rating:77,kd:1.04,adr:75.6,hs:58,win:55,matches:18,mvps:1,kills:288,deaths:277,firstKills:25,firstDeaths:27,clutches:3,teamHistory:["Projeto X"],demo:true},
 {id:"demo-5",nickname:"Rift",steam:"",country:"Brasil",mainRole:"Lurker",secondaryRole:"Rifler",team:"Sem equipe",marketStatus:"Livre",bio:"Jogador paciente, atento a timings, flancos e punição de rotações.",rating:75,kd:1.12,adr:77.8,hs:63,win:50,matches:14,mvps:2,kills:230,deaths:205,firstKills:31,firstDeaths:19,clutches:4,teamHistory:[],demo:true}
];
let players = loadPlayers();
function loadPlayers(){try{const saved=localStorage.getItem(STORAGE_KEY);return saved?JSON.parse(saved):demoPlayers.slice()}catch(e){return demoPlayers.slice()}}
function savePlayers(){localStorage.setItem(STORAGE_KEY,JSON.stringify(players))}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const initials = n => (n||"?").slice(0,2).toUpperCase();
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleShort = r => r==="Entry-Fragger"?"ENTRY":r==="Support"?"SUPPORT":r==="AWPer"?"AWPER":r==="Lurker"?"LURKER":r==="Rifler"?"RIFLER":"IGL";
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function go(page){$$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));$$(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));$("#crumb").textContent=({home:"VISÃO GERAL",players:"JOGADORES",rankings:"RANKINGS",teams:"EQUIPES",market:"MERCADO"})[page]||page.toUpperCase();$(".sidebar").classList.remove("open");if(page==="players")renderPlayers();if(page==="rankings")renderRanking();if(page==="market")loadMarketData();if(page==="teams")loadTeamsData();window.scrollTo(0,0)}
$$("[data-page]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();go(a.dataset.page)}));
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));
$("#mobileMenu").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
function openForm(p=null){$("#playerForm").reset();$("#editId").value=p?.id||"";$("#modalTitle").textContent=p?"EDITAR PERFIL":"CRIAR PERFIL";if(p){$("#nickname").value=p.nickname;$("#steam").value=p.steam||"";$("#country").value=p.country||"Brasil";$("#mainRole").value=p.mainRole;$("#secondaryRole").value=p.secondaryRole||"";$("#team").value=p.team==="Sem equipe"?"":p.team;$("#marketStatus").value=p.marketStatus||"Disponível";$("#bio").value=p.bio||"";}$("#profileModal").classList.add("open")}
function closeForm(){$("#profileModal").classList.remove("open")}
["#newPlayerTop","#createFromHero","#createFromPanel","#newPlayerList"].forEach(s=>$(s).addEventListener("click",()=>openForm()));
$("#closeModal").addEventListener("click",closeForm);$("#cancelModal").addEventListener("click",closeForm);
$("#profileModal").addEventListener("click",e=>{if(e.target.id==="profileModal")closeForm()});
$("#playerForm").addEventListener("submit",e=>{e.preventDefault();const editId=$("#editId").value;const nickname=$("#nickname").value.trim();if(!nickname)return;const duplicate=players.find(p=>p.nickname.toLowerCase()===nickname.toLowerCase()&&p.id!==editId);if(duplicate){toast("Esse nickname já está cadastrado.");return}
const existing=players.find(p=>p.id===editId);const p={...(existing||{}),id:editId||`p-${Date.now()}`,nickname,steam:$("#steam").value.trim(),country:$("#country").value,mainRole:$("#mainRole").value,secondaryRole:$("#secondaryRole").value,team:$("#team").value.trim()||"Sem equipe",marketStatus:$("#marketStatus").value,bio:$("#bio").value.trim(),rating:existing?.rating??null,kd:existing?.kd??null,adr:existing?.adr??null,hs:existing?.hs??null,win:existing?.win??null,matches:existing?.matches??0,mvps:existing?.mvps??0,kills:existing?.kills??0,deaths:existing?.deaths??0,firstKills:existing?.firstKills??0,firstDeaths:existing?.firstDeaths??0,clutches:existing?.clutches??0,teamHistory:existing?.teamHistory||[],demo:false};
if(existing){players=players.map(x=>x.id===editId?p:x)}else players.unshift(p);savePlayers();closeForm();renderAll();toast(existing?"Perfil atualizado.":"Perfil criado com sucesso!")});
function playerCard(p){return `<article class="player-card" data-open="${safe(p.id)}"><div class="card-top"><div class="avatar">${safe(initials(p.nickname))}</div><div class="card-identity"><b>${safe(p.nickname)}</b><small>${safe(p.team||"Sem equipe")} · ${safe(p.country||"")}</small></div><span class="rating-mini">${p.rating??"—"}<small>RATING AM</small></span></div><span class="role-tag">${safe(roleShort(p.mainRole))}</span><div class="card-stats"><div><strong>${p.kd??"N/A"}</strong><small>K/D</small></div><div><strong>${p.adr??"N/A"}</strong><small>ADR</small></div><div><strong>${p.win==null?"N/A":p.win+"%"}</strong><small>WIN RATE</small></div></div></article>`}
function bindPlayerCards(){ $$("[data-open]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.open)))}
function renderPlayers(){const q=$("#playerSearch").value.toLowerCase();const role=$("#roleFilter").value;let list=players.filter(p=>(p.nickname.toLowerCase().includes(q)||(p.team||"").toLowerCase().includes(q))&&(!role||p.mainRole===role));const sort=$("#sortPlayers").value;if(sort==="rating")list.sort((a,b)=>(b.rating??-1)-(a.rating??-1));else if(sort==="kd")list.sort((a,b)=>(b.kd??-1)-(a.kd??-1));else list.sort((a,b)=>a.nickname.localeCompare(b.nickname));$("#playersGrid").innerHTML=list.length?list.map(playerCard).join(""):`<div class="empty-state" style="grid-column:1/-1"><div class="empty-symbol">⌕</div><h3>Nenhum jogador encontrado</h3><p>Tente alterar a pesquisa ou os filtros.</p></div>`;bindPlayerCards()}
["#playerSearch","#roleFilter","#sortPlayers"].forEach(s=>$(s).addEventListener("input",renderPlayers));
function openDetail(id){const p=players.find(x=>x.id===id);if(!p)return;$("#detailContent").innerHTML=`<div class="modal-head"><span class="eyebrow">PLAYER PROFILE / ACS</span><button class="icon-button" id="closeDetail">×</button></div><div class="detail-hero"><div class="avatar">${safe(initials(p.nickname))}</div><div><h2>${safe(p.nickname)}</h2><p>${safe(p.team||"Sem equipe")} · ${safe(p.country||"Brasil")}</p><span class="role-tag">${safe(p.mainRole)}${p.secondaryRole?" / "+safe(p.secondaryRole):""}</span></div><div class="detail-rating">${p.rating??"—"}<small>RATING AM</small></div></div><div class="detail-section"><h3>Estatísticas gerais</h3><div class="detail-stats">${stat("PARTIDAS",p.matches??0)}${stat("K/D",p.kd??"N/A")}${stat("ADR",p.adr??"N/A")}${stat("HS%",p.hs==null?"N/A":p.hs+"%")}${stat("WIN RATE",p.win==null?"N/A":p.win+"%")}${stat("MVPs",p.mvps??0)}${stat("FIRST KILLS",p.firstKills??"N/A")}${stat("CLUTCHES",p.clutches??"N/A")}</div></div><div class="detail-section"><h3>Perfil competitivo</h3><p class="detail-bio">${safe(p.bio||"Este jogador ainda não adicionou uma biografia.")}</p><p class="detail-bio"><b>Status no mercado:</b> ${safe(p.marketStatus||"Não informado")}</p><p class="detail-bio"><b>Steam:</b> ${p.steam?`<a href="${safe(p.steam)}" target="_blank" rel="noopener" style="color:#8cc3ff">Abrir perfil Steam ↗</a>`:"Não informado"}</p></div><div class="detail-section"><h3>Histórico competitivo</h3><p class="detail-bio">${p.demo?"Perfil demonstrativo. Resultados fictícios para visualizar o layout.":"Nenhuma partida oficial registrada para este perfil."}</p></div><div class="detail-actions">${((currentUser&&p.userId===currentUser.id)||(!supabaseClient&&String(p.id).startsWith("p-")))?'<button class="btn btn-primary" id="editPlayer">Editar perfil</button>':""}${p.demo?'<span class="form-note">DADO DE DEMONSTRAÇÃO</span>':""}</div>`;$("#detailModal").classList.add("open");$("#closeDetail").addEventListener("click",()=>$("#detailModal").classList.remove("open"));$("#editPlayer")?.addEventListener("click",()=>{const current=players.find(x=>x.id===id);$("#detailModal").classList.remove("open");openForm(current)})}
function stat(label,value){return `<div class="detail-stat"><b>${safe(value)}</b><small>${label}</small></div>`}
$("#detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")$("#detailModal").classList.remove("open")});
function renderHome(){const real=players.filter(p=>!p.demo);$("#totalPlayers").textContent=players.length;$("#totalTeams").textContent=new Set(players.map(p=>p.team).filter(t=>t&&t!=="Sem equipe")).size;$("#totalMatches").textContent=players.reduce((n,p)=>n+(p.matches||0),0);$("#featuredCount").textContent=players.filter(p=>p.rating!=null).length;const list=[...players].sort((a,b)=>(b.rating??-1)-(a.rating??-1)).slice(0,4);$("#featuredPlayers").innerHTML=list.length?list.map(p=>`<div class="player-row" data-open="${safe(p.id)}"><div class="avatar">${safe(initials(p.nickname))}</div><div class="player-main"><b>${safe(p.nickname)}</b><small>${safe(p.mainRole)} · ${safe(p.team)}</small></div><div class="rating-mini">${p.rating??"—"}<small>RATING AM</small></div></div>`).join(""):`<p class="muted">Ainda não há jogadores cadastrados.</p>`;bindPlayerCards()}
function renderRanking(){const list=[...players].filter(p=>p.rating!=null).sort((a,b)=>b.rating-a.rating);$("#rankingList").innerHTML=list.length?list.map((p,i)=>`<div class="rank-row"><div class="rank-number">#${String(i+1).padStart(2,"0")}</div><div><b>${safe(p.nickname)}</b><div class="rank-bar"><i style="width:${Math.max(0,Math.min(100,p.rating))}%"></i></div></div><div class="muted small">${safe(p.mainRole)}</div><div class="rank-value">${p.rating}</div></div>`).join(""):`<div class="empty-state"><h3>Sem dados suficientes</h3><p>Os rankings aparecerão quando houver jogadores com avaliações registradas.</p></div>`}
function renderAll(){renderHome();renderPlayers();renderRanking()}
renderAll();


// ---- Optional Supabase authentication and cloud profile persistence ----
let supabaseClient = null;
let authMode = "login";
let currentUser = null;
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
  supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
    currentUser=session?.user||null;
    updateAuthButton();
    await loadCloudPlayers();
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
}
$("#authButton")?.addEventListener("click",async()=>{
  if(currentUser && supabaseClient){
    const {error}=await supabaseClient.auth.signOut();
    if(error)toast("Não foi possível sair: "+error.message);
    else {currentUser=null;updateAuthButton();toast("Você saiu da conta.");}
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
    secondaryRole:p.secondary_role||"",team:p.team_name,marketStatus:p.market_status,bio:p.bio||"",userId:p.user_id,
    rating:null,kd:null,adr:null,hs:null,win:null,matches:0,mvps:0,kills:0,deaths:0,
    firstKills:0,firstDeaths:0,clutches:0,teamHistory:[],demo:false
  }));
  // When logged in, the cloud database is authoritative for real profiles.
  players=[...cloud,...players.filter(p=>p.demo)];
  savePlayers();renderAll();
  if(document.querySelector("#page-market.active")) await loadMarketData();
  if(document.querySelector("#page-teams.active")) await loadTeamsData();
}
const originalPlayerSubmit=$("#playerForm").onsubmit;
$("#playerForm").addEventListener("submit",async()=>{
  if(!supabaseClient||!currentUser)return;
  // The local save handler remains useful in demo mode; cloud writes happen for signed-in users.
  const nickname=$("#nickname").value.trim();
  const payload={
    user_id:currentUser.id,nickname,steam_url:$("#steam").value.trim()||null,
    country:$("#country").value,main_role:$("#mainRole").value,
    secondary_role:$("#secondaryRole").value||null,team_name:$("#team").value.trim()||"Sem equipe",
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
  const listings=players.filter(p=>!p.demo&&p.userId&&["Disponível","Negociável","Livre","Em negociação"].includes(p.marketStatus));
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
  if(!target||target.demo||target.id===own.id){toast("Esse jogador não pode receber esta proposta.");return;}
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
  const {error}=await supabaseClient.from("transfer_offers").update({status,decided_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
  if(error){toast("Não foi possível atualizar a proposta: "+error.message);return;}
  toast(action==="accept"?"Proposta aceita.":action==="reject"?"Proposta recusada.":"Proposta cancelada.");
  await loadCloudPlayers();await loadMarketData();
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
  const [teamsRes,membersRes]=await Promise.all([
    supabaseClient.from("teams").select("id,name,tag,capacity,captain_player_id,created_at").order("created_at",{ascending:false}),
    supabaseClient.from("team_members").select("team_id,player_id,role")
  ]);
  if(teamsRes.error||membersRes.error){
    $("#teamsList").innerHTML=`<div class="market-empty"><b>Não foi possível carregar as equipes</b>${safe((teamsRes.error||membersRes.error).message)}</div>`;
    return;
  }
  cloudTeams=teamsRes.data||[];teamMembers=membersRes.data||[];
  teamInvites=[];
  if(currentUser){
    const inv=await supabaseClient.from("team_invites").select("id,team_id,invited_player_id,invited_by_player_id,status,created_at").order("created_at",{ascending:false});
    if(inv.error){toast("Erro ao carregar convites: "+inv.error.message)}else teamInvites=inv.data||[];
  }
  renderTeams();
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
    const available=players.filter(p=>!p.demo&&p.userId&&p.id!==own?.id&&p.team==="Sem equipe"&&!teamMembers.some(m=>m.player_id===p.id));
    const memberHtml=members.map(m=>{
      const player=players.find(p=>p.id===m.player_id);
      return `<div class="team-member"><div><b>${safe(player?.nickname||"Jogador")}</b><small>${m.role==="captain"?"CAPITÃO":"INTEGRANTE"} · ${safe(player?.mainRole||"")}</small></div>${isCaptain&&m.role!=="captain"?`<button class="btn btn-ghost btn-small" data-team-remove="${m.player_id}">Remover</button>`:""}</div>`;
    }).join("");
    const inviteForm=isCaptain&&members.length<team.capacity?`<form class="team-invite-form" data-team-invite-form="${team.id}"><select required name="player"><option value="">Selecionar jogador livre...</option>${available.map(p=>`<option value="${p.id}">${safe(p.nickname)} · ${safe(p.mainRole)}</option>`).join("")}</select><button class="btn btn-primary btn-small" type="submit" ${available.length?"":"disabled"}>Convidar</button></form>`:"";
    return `<article class="team-card"><div class="team-card-head"><div><span class="eyebrow">${safe(team.tag||"ACS TEAM")}</span><h3>${safe(team.name)}</h3><p>Capitão: ${safe(captain?.nickname||"Não informado")}</p></div><span class="team-capacity">${members.length}/${team.capacity}</span></div><div class="team-roster">${memberHtml||'<p class="muted small">Nenhum integrante listado.</p>'}</div>${inviteForm}${isCaptain&&pending.length?`<p class="form-note">${pending.length} convite(s) aguardando resposta.</p>`:""}</article>`;
  }).join(""):'<div class="market-empty"><b>Nenhuma equipe criada</b>Seja o primeiro a montar seu elenco e chamar outros jogadores.</div>';
  $("#teamCreateForm")?.querySelector("button[type=submit]")?.toggleAttribute("disabled",!currentUser||!own||!!membership);
  $$('[data-team-invite-response]').forEach(b=>b.addEventListener("click",()=>respondTeamInvite(b.dataset.teamInviteId,b.dataset.teamInviteResponse)));
  $$('[data-team-remove]').forEach(b=>b.addEventListener("click",()=>removeTeamMember(b.dataset.teamRemove)));
  $$('[data-team-invite-form]').forEach(form=>form.addEventListener("submit",async e=>{
    e.preventDefault();const playerId=new FormData(form).get("player");if(!playerId)return;
    const {error}=await supabaseClient.rpc("acs_invite_player",{p_team_id:form.dataset.teamInviteForm,p_player_id:playerId});
    if(error){toast("Não foi possível enviar o convite: "+error.message);return;}
    toast("Convite enviado!");await loadTeamsData();
  }));
}
$("#teamCreateForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!supabaseClient||!currentUser){toast("Entre na sua conta para criar uma equipe.");return;}
  if(!currentPlayerProfile()){toast("Crie seu perfil de jogador antes de criar uma equipe.");return;}
  const button=$("#createTeamButton");button.disabled=true;
  const {error}=await supabaseClient.rpc("acs_create_team",{p_name:$("#newTeamName").value.trim(),p_tag:$("#newTeamTag").value.trim()||null,p_capacity:Number($("#newTeamCapacity").value)});
  button.disabled=false;
  if(error){toast("Não foi possível criar a equipe: "+error.message);return;}
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
$("#refreshTeams")?.addEventListener("click",async()=>{await loadCloudPlayers();await loadTeamsData();toast("Equipes atualizadas.")});
