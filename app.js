const ACS_MAPS=["Ancient","Anubis","Cache","Dust II","Inferno","Mirage","Nuke"];
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

 // These adapters keep early auth/session callbacks safe before match-entry.js finishes loading.
 function renderMatchPlayerRows(){window.ACS5_MATCH_ENTRY?.renderRosterEditor?.();}
 function renderMapEditors(){window.ACS5_MATCH_ENTRY?.renderMapTables?.();}

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function go(page){$$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));$$(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));$("#crumb").textContent=({home:"VISÃO GERAL",players:"JOGADORES",rankings:"RANKINGS",matches:"PARTIDAS",teams:"EQUIPES",economy:"ECONOMIA",market:"MERCADO"})[page]||page.toUpperCase();$(".sidebar").classList.remove("open");if(page==="players")renderPlayers();if(page==="rankings")renderRanking();if(page==="matches"){loadMatches();renderPublicStats();if(isAdmin){renderMatchPlayerRows();renderMapEditors();$("#matchesAdminPanel").style.display="block";loadTeamsData();}}if(page==="market")loadMarketData();if(page==="teams")loadTeamsData();window.scrollTo(0,0)}
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

// Admin authorization is always checked against the database, never browser metadata.
async function refreshAdminStatus(){
  if(!supabaseClient||!currentUser){isAdmin=false;}
  else{
    const {data,error}=await supabaseClient.rpc("acs_is_admin");
    isAdmin=!error&&data===true;
    if(error)console.warn("ACS admin status:",error.message);
  }
  const show=(selector,visible)=>{const el=$(selector);if(el)el.style.display=visible?"block":"none";};
  show("#adminActivationPanel",!!currentUser&&!isAdmin);
  show("#adminWorkspace",isAdmin);
  show("#matchesAdminPanel",isAdmin);
  show("#tournamentAdminPanel",isAdmin);
  const adminNav=document.querySelector('[data-page="admin"]');
  if(adminNav)adminNav.style.display=currentUser?"flex":"none";
  if(isAdmin)renderAdminPanel();
}
function renderAdminPanel(){
  const select=$("#adminPlayerSelect");if(!select)return;
  const keep=select.value;
  select.innerHTML='<option value="">Selecione um jogador</option>'+players.filter(p=>p.userId).map(p=>`<option value="${safe(p.id)}">${safe(p.nickname)}</option>`).join("");
  if(players.some(p=>p.id===keep))select.value=keep;
}
$("#adminActivateForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabaseClient||!currentUser){toast("Entre na sua conta antes de ativar o painel.");return;}
  const button=$("#adminActivateButton");button.disabled=true;
  const {data,error}=await supabaseClient.rpc("acs_claim_admin",{p_code:$("#adminCode").value.trim()});
  button.disabled=false;
  if(error){toast("Não foi possível ativar o painel: "+error.message);return;}
  if(data!==true){toast("Código inválido ou já utilizado.");return;}
  $("#adminCode").value="";await refreshAdminStatus();toast("Acesso administrativo ativado.");
});
$("#adminPlayerSelect")?.addEventListener("change",async()=>{
  const id=$("#adminPlayerSelect").value,form=$("#adminStatsForm");
  if(!id){form.style.display="none";return;}
  const {data,error}=await supabaseClient.from("player_competitive_stats").select("*").eq("player_id",id).maybeSingle();
  if(error){toast("Não foi possível carregar as estatísticas.");return;}
  ["rating_am","kd","adr","headshot_pct","win_rate","matches","mvps","kills","deaths","first_kills","first_deaths","clutches"].forEach(key=>{const el=$("#stat_"+key);if(el)el.value=data?.[key]??"";});
  form.style.display="grid";
});
$("#adminStatsForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const id=$("#adminPlayerSelect").value;if(!id)return;
  const stats={};["rating_am","kd","adr","headshot_pct","win_rate","matches","mvps","kills","deaths","first_kills","first_deaths","clutches"].forEach(key=>{const el=$("#stat_"+key);stats[key]=el?.value??"";});
  const {error}=await supabaseClient.rpc("acs_admin_update_player_stats",{p_player_id:id,p_stats:stats});
  if(error){toast("Não foi possível salvar: "+error.message);return;}
  toast("Estatísticas atualizadas.");await loadCloudPlayers();
});
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
  const avatarFile=$("#profileAvatarFile")?.files?.[0]||null;
  let avatarUrl=$("#profileAvatarUrl")?.value.trim()||null;
  if(avatarFile){
    if(!window.ACS6?.uploadImage){toast("O envio de imagens ainda não está disponível.");return;}
    try{avatarUrl=await window.ACS6.uploadImage(avatarFile,`avatars/${currentUser.id}`);}
    catch(err){toast("Falha ao enviar a foto: "+(err?.message||"erro"));return;}
  }
  const payload={
    user_id:currentUser.id,nickname,steam_url:$("#steam").value.trim()||null,
    country:$("#country").value,main_role:$("#mainRole").value,
    secondary_role:$("#secondaryRole").value||null,
    market_status:$("#marketStatus").value,bio:$("#bio").value.trim()||null,
    avatar_url:avatarUrl,
    profile_frame_color:$("#profileFrameColor")?.value||"blue",
    profile_background:$("#profileBackground")?.value||"blue",
    profile_name_color:$("#profileNameColor")?.value||"white"
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
function renderPublicStats(){
  const host=$("#publicStatsList");if(!host)return;
  const ranked=[...players].filter(p=>p.matches>0||p.rating!=null).sort((a,b)=>(b.rating??-1)-(a.rating??-1));
  host.innerHTML=ranked.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>#</th><th>Jogador</th><th>Rating AM</th><th>Partidas</th><th>K/D</th><th>ADR</th><th>HS%</th><th>Win rate</th></tr></thead><tbody>${ranked.map((p,i)=>`<tr><td>${i+1}</td><td><b>${safe(p.nickname)}</b><small>${safe(p.mainRole||"")}</small></td><td>${p.rating==null?"—":Number(p.rating).toFixed(2)}</td><td>${p.matches||0}</td><td>${p.kd==null?"—":Number(p.kd).toFixed(2)}</td><td>${p.adr==null?"—":Number(p.adr).toFixed(1)}</td><td>${p.hs==null?"—":Number(p.hs).toFixed(1)+"%"}</td><td>${p.win==null?"—":Number(p.win).toFixed(1)+"%"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="market-empty">Ainda não existem estatísticas oficiais. Elas aparecerão aqui após o registro das primeiras partidas.</div>';
}
async function loadPlayerSideStats(){
  const host=$("#playerSideStats");if(!host||!supabaseClient)return;
  const {data,error}=await supabaseClient.from("player_side_round_stats").select("player_id,match_id,map_number,side,rounds_won,rounds_played");
  if(error){host.innerHTML=`<div class="market-empty">Estatísticas por lado indisponíveis: ${safe(error.message)}</div>`;return;}
  const rows=data||[],matchIds=[...new Set(rows.map(r=>r.match_id).filter(Boolean))];let mapRows=[];
  for(let i=0;i<matchIds.length;i+=100){
    const result=await supabaseClient.from("match_maps").select("match_id,map_number,map_name").in("match_id",matchIds.slice(i,i+100));
    if(result.error){host.innerHTML=`<div class="market-empty">Falha ao carregar mapas: ${safe(result.error.message)}</div>`;return;}
    mapRows.push(...(result.data||[]));
  }
  const names=new Map(mapRows.map(m=>[`${m.match_id}:${m.map_number}`,m.map_name]));
  const total=new Map(),perMap=new Map();
  rows.forEach(r=>{
    if(!r.player_id||!["TR","CT"].includes(r.side))return;
    const add=(map,key)=>{if(!map.has(key))map.set(key,{TR:[0,0],CT:[0,0]});map.get(key)[r.side][0]+=Number(r.rounds_won)||0;map.get(key)[r.side][1]+=Number(r.rounds_played)||0;};
    add(total,r.player_id);add(perMap,`${r.player_id}|${names.get(`${r.match_id}:${r.map_number}`)||"Mapa "+r.map_number}`);
  });
  const pct=(v,side)=>v?.[side]?.[1]?100*v[side][0]/v[side][1]:null;
  const overall=[...total].map(([id,v])=>({p:players.find(p=>p.id===id),tr:pct(v,"TR"),ct:pct(v,"CT")})).filter(x=>x.p);
  const detail=[...perMap].map(([key,v])=>{const [id,map]=key.split("|");return {p:players.find(p=>p.id===id),map,tr:pct(v,"TR"),ct:pct(v,"CT"),trRounds:v.TR[1],ctRounds:v.CT[1]};}).filter(x=>x.p).sort((a,b)=>a.map.localeCompare(b.map)||a.p.nickname.localeCompare(b.p.nickname));
  const table=(items,headers,render)=>items.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${items.map(render).join("")}</tbody></table></div>`:"";
  const overallHtml=table(overall,["Jogador","Win TR","Win CT"],x=>`<tr><td><b>${safe(x.p.nickname)}</b></td><td>${x.tr==null?"—":x.tr.toFixed(1)+"%"}</td><td>${x.ct==null?"—":x.ct.toFixed(1)+"%"}</td></tr>`);
  const detailHtml=table(detail,["Jogador","Mapa","Win TR","Win CT","Rounds TR / CT"],x=>`<tr><td><b>${safe(x.p.nickname)}</b></td><td>${safe(x.map)}</td><td>${x.tr==null?"—":x.tr.toFixed(1)+"%"}</td><td>${x.ct==null?"—":x.ct.toFixed(1)+"%"}</td><td>${x.trRounds} / ${x.ctRounds}</td></tr>`);
  host.innerHTML=(overallHtml||'<div class="market-empty">As taxas por lado aparecerão após as primeiras partidas.</div>')+(detailHtml?`<h4 class="stats-subheading">Detalhamento por mapa</h4>${detailHtml}`:"");
}
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
let loadedMatchRecords=[];
function openMatchDetail(match){
  if(!match)return;
  let overlay=$("#matchDetailModal");
  if(!overlay){
    overlay=document.createElement("div");overlay.id="matchDetailModal";overlay.className="modal-backdrop";
    overlay.innerHTML='<div class="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="matchDetailTitle"><div class="modal-head"><div><span class="eyebrow">MATCH REPORT</span><h2 id="matchDetailTitle">Detalhes da partida</h2></div><button class="icon-button" type="button" data-close-match-detail aria-label="Fechar">×</button></div><div id="matchDetailContent"></div></div>';
    document.body.append(overlay);
    overlay.addEventListener("click",e=>{if(e.target===overlay||e.target.closest("[data-close-match-detail]"))overlay.classList.remove("open");});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")overlay.classList.remove("open");});
  }
  const maps=(match.match_maps||[]).slice().sort((a,b)=>a.map_number-b.map_number);
  const stats=(match.player_match_stats||[]).slice().sort((a,b)=>(a.team_side||"").localeCompare(b.team_side||"")||String(a.player_name_snapshot||"").localeCompare(String(b.player_name_snapshot||"")));
  const veto=(match.match_veto_actions||[]).slice().sort((a,b)=>a.sequence_no-b.sequence_no);
  const date=match.played_at?new Date(match.played_at).toLocaleString("pt-BR"):"Data não informada";
  const mapHtml=maps.length?maps.map(m=>{
    const start=m.team_a_start_side||"—";
    const ot=(Number(m.a_ot_tr||0)+Number(m.a_ot_ct||0)+Number(m.b_ot_tr||0)+Number(m.b_ot_ct||0))>0
      ?`<small>OT — A TR/CT: ${m.a_ot_tr}/${m.a_ot_ct} · B TR/CT: ${m.b_ot_tr}/${m.b_ot_ct}</small>`:"";
    return `<div class="match-detail-map"><div><b>Mapa ${m.map_number}: ${safe(m.map_name)}</b><strong>${m.team_a_score} × ${m.team_b_score}</strong></div><small>Lado inicial da equipe A: ${safe(start)} · 1º tempo: ${m.a_first_half}–${m.b_first_half} · 2º tempo: ${m.a_second_half}–${m.b_second_half}</small>${ot}</div>`;
  }).join(""):'<p class="muted">Sem placares por mapa disponíveis.</p>';
  const playerHtml=stats.length?`<div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>Jogador</th><th>Equipe</th><th>K/D/A</th><th>ADR</th><th>HS%</th><th>MVP</th></tr></thead><tbody>${stats.map(p=>{
    const name=p.players?.nickname||p.player_name_snapshot||"Jogador convidado";
    return `<tr><td><b>${safe(name)}</b>${p.is_guest?'<small>Convidado</small>':""}</td><td>${p.team_side==="A"?safe(match.team_a_name):p.team_side==="B"?safe(match.team_b_name):"—"}</td><td>${p.kills}/${p.deaths}/${p.assists}</td><td>${p.adr==null?"—":Number(p.adr).toFixed(1)}</td><td>${p.headshot_pct==null?"—":Number(p.headshot_pct).toFixed(1)+"%"}</td><td>${p.mvps||0}</td></tr>`;
  }).join("")}</tbody></table></div>`:'<p class="muted">Sem estatísticas individuais registradas.</p>';
  const vetoHtml=veto.length?`<div class="match-detail-veto">${veto.map(v=>`<span><b>${v.sequence_no}.</b> ${safe(v.action_type.toUpperCase())} · ${safe(v.map_name)} · ${safe(v.team_name_snapshot||"Equipe não informada")}${v.starting_side?" · "+safe(v.starting_side):""}</span>`).join("")}</div>`:'<p class="muted">Não há ações de veto registradas.</p>';
  $("#matchDetailTitle").textContent=`${match.team_a_name} ${match.team_a_score} × ${match.team_b_score} ${match.team_b_name}`;
  $("#matchDetailContent").innerHTML=`<p class="form-note">${safe(date)} · MD${match.best_of||1}</p><section class="detail-section"><h3>Mapas e rounds</h3>${mapHtml}</section><section class="detail-section"><h3>Estatísticas individuais</h3>${playerHtml}</section><section class="detail-section"><h3>Veto, picks e decider</h3>${vetoHtml}</section>${match.notes?`<section class="detail-section"><h3>Observações</h3><p class="detail-bio">${safe(match.notes)}</p></section>`:""}`;
  overlay.classList.add("open");
}
async function loadMatches(){
  const host=$("#matchesList");if(!host)return;
  renderPublicStats();
  if(!supabaseClient){host.innerHTML='<div class="market-empty">Conecte o Supabase para consultar o histórico oficial.</div>';return;}
  host.innerHTML='<div class="market-empty">Carregando partidas...</div>';
  const {data,error}=await supabaseClient.from("matches").select("id,played_at,map_name,team_a_name,team_b_name,team_a_score,team_b_score,status,best_of,notes,player_match_stats(player_id,player_name_snapshot,is_guest,kills,deaths,assists,adr,headshot_pct,mvps,first_kills,first_deaths,clutches_won,team_side,players(nickname)),player_map_stats(player_id,map_number,map_name,kills,deaths,assists,adr,headshot_pct,mvps,player_name_snapshot,is_guest,team_side,players(nickname)),match_maps(map_number,map_name,team_a_score,team_b_score,team_a_start_side,a_first_half,b_first_half,a_second_half,b_second_half,a_ot_tr,a_ot_ct,b_ot_tr,b_ot_ct),match_veto_actions(sequence_no,action_type,map_name,team_name_snapshot,starting_side)").eq("status","completed").order("played_at",{ascending:false}).limit(100);
  if(error){host.innerHTML=`<div class="market-empty">Não foi possível carregar partidas: ${safe(error.message)}</div>`;return;}
  await loadPlayerSideStats();
  await loadPlayerMapStats();
  const matches=data||[];loadedMatchRecords=matches;$("#matchCount").textContent=`${matches.length} partida${matches.length===1?"":"s"}`;
  host.innerHTML=matches.length?matches.map(m=>{
    const date=m.played_at?new Date(m.played_at).toLocaleString("pt-BR"):"Data não informada";
    const winner=m.team_a_score>m.team_b_score?"A":m.team_b_score>m.team_a_score?"B":"D";
    const ordered=(m.match_maps||[]).slice().sort((a,b)=>a.map_number-b.map_number);
    const dotsA=ordered.map(mm=>`<i class="match-map-dot ${mm.team_a_score>mm.team_b_score?"is-won":""}" title="${safe(mm.map_name)}"></i>`).join("");
    const dotsB=ordered.map(mm=>`<i class="match-map-dot ${mm.team_b_score>mm.team_a_score?"is-won":""}" title="${safe(mm.map_name)}"></i>`).join("");
    return `<article class="match-card match-card-compact" data-match-id="${safe(m.id)}"><div class="match-card-top"><small>${safe(date)} · MD${m.best_of||1}</small>${isAdmin?`<button class="btn btn-danger btn-small" data-delete-match="${safe(m.id)}">Excluir</button>`:""}</div><div class="match-score"><b class="${winner==="A"?"match-winner":""}">${safe(m.team_a_name)}</b><strong>${m.team_a_score} : ${m.team_b_score}</strong><b class="${winner==="B"?"match-winner":""}">${safe(m.team_b_name)}</b></div>${(m.best_of||1)>1?`<div class="match-map-tracks"><div><small>${safe(m.team_a_name)}</small>${dotsA}</div><div><small>${safe(m.team_b_name)}</small>${dotsB}</div></div>`:""}</article>`;
  }).join(""):'<div class="empty-state"><h3>Nenhuma partida registrada</h3><p>Quando a administração cadastrar o primeiro confronto, ele aparecerá aqui.</p></div>';
  $("#matchesList .match-card[data-match-id]").forEach(card=>{
    card.setAttribute("role","button");card.setAttribute("tabindex","0");
    const open=()=>openMatchDetail(loadedMatchRecords.find(m=>m.id===card.dataset.matchId));
    card.addEventListener("click",e=>{if(e.target.closest("[data-delete-match]"))return;open();});
    card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
  });
  $('[data-delete-match]').forEach(btn=>btn.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();
    if(!isAdmin){toast("Somente administradores podem excluir partidas.");return;}
    if(!confirm("Excluir esta partida? As estatísticas dos jogadores serão recalculadas sem este confronto."))return;
    btn.disabled=true;btn.textContent="Excluindo...";
    try{
      const {data,error}=await supabaseClient.rpc("acs_admin_delete_match",{p_match_id:btn.dataset.deleteMatch});
      if(error)throw error;
      if(data===false)throw new Error("A partida não foi encontrada ou já foi excluída.");
      toast("Partida excluída e estatísticas recalculadas.");
      await loadCloudPlayers();await loadMatches();
    }catch(error){
      toast("Não foi possível excluir a partida: "+(error?.message||"erro inesperado"));
      btn.disabled=false;btn.textContent="Excluir";
    }
  }));
}
$("#refreshMatches")?.addEventListener("click",loadMatches);
$("#adminMatchForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(typeof window.ACS5_MATCH_ENTRY?.submit==="function"){
    await window.ACS5_MATCH_ENTRY.submit(e);
    return;
  }
  toast("O novo formulário de partidas ainda está carregando. Atualize a página.");
});