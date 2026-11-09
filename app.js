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
function go(page){$$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));$$(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));$("#crumb").textContent=({home:"VISÃO GERAL",players:"JOGADORES",rankings:"RANKINGS",teams:"EQUIPES",market:"MERCADO"})[page]||page.toUpperCase();$(".sidebar").classList.remove("open");if(page==="players")renderPlayers();if(page==="rankings")renderRanking();window.scrollTo(0,0)}
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
function openDetail(id){const p=players.find(x=>x.id===id);if(!p)return;$("#detailContent").innerHTML=`<div class="modal-head"><span class="eyebrow">PLAYER PROFILE / ACS</span><button class="icon-button" id="closeDetail">×</button></div><div class="detail-hero"><div class="avatar">${safe(initials(p.nickname))}</div><div><h2>${safe(p.nickname)}</h2><p>${safe(p.team||"Sem equipe")} · ${safe(p.country||"Brasil")}</p><span class="role-tag">${safe(p.mainRole)}${p.secondaryRole?" / "+safe(p.secondaryRole):""}</span></div><div class="detail-rating">${p.rating??"—"}<small>RATING AM</small></div></div><div class="detail-section"><h3>Estatísticas gerais</h3><div class="detail-stats">${stat("PARTIDAS",p.matches??0)}${stat("K/D",p.kd??"N/A")}${stat("ADR",p.adr??"N/A")}${stat("HS%",p.hs==null?"N/A":p.hs+"%")}${stat("WIN RATE",p.win==null?"N/A":p.win+"%")}${stat("MVPs",p.mvps??0)}${stat("FIRST KILLS",p.firstKills??"N/A")}${stat("CLUTCHES",p.clutches??"N/A")}</div></div><div class="detail-section"><h3>Perfil competitivo</h3><p class="detail-bio">${safe(p.bio||"Este jogador ainda não adicionou uma biografia.")}</p><p class="detail-bio"><b>Status no mercado:</b> ${safe(p.marketStatus||"Não informado")}</p><p class="detail-bio"><b>Steam:</b> ${p.steam?`<a href="${safe(p.steam)}" target="_blank" rel="noopener" style="color:#8cc3ff">Abrir perfil Steam ↗</a>`:"Não informado"}</p></div><div class="detail-section"><h3>Histórico competitivo</h3><p class="detail-bio">${p.demo?"Perfil demonstrativo. Resultados fictícios para visualizar o layout.":"Nenhuma partida oficial registrada para este perfil."}</p></div><div class="detail-actions"><button class="btn btn-primary" id="editPlayer">Editar perfil</button>${p.demo?'<span class="form-note">DADO DE DEMONSTRAÇÃO</span>':""}</div>`;$("#detailModal").classList.add("open");$("#closeDetail").addEventListener("click",()=>$("#detailModal").classList.remove("open"));$("#editPlayer").addEventListener("click",()=>{const current=players.find(x=>x.id===id);$("#detailModal").classList.remove("open");openForm(current)})}
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
  if(currentUser) await loadCloudPlayers();
  supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
    currentUser=session?.user||null;
    updateAuthButton();
    if(currentUser) await loadCloudPlayers();
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
  if(!supabaseClient||!currentUser)return;
  const {data,error}=await supabaseClient.from("players").select("*").order("nickname");
  if(error){toast("Erro ao carregar perfis online.");return;}
  const cloud=(data||[]).map(p=>({
    id:p.id,nickname:p.nickname,steam:p.steam_url||"",country:p.country,mainRole:p.main_role,
    secondaryRole:p.secondary_role||"",team:p.team_name,marketStatus:p.market_status,bio:p.bio||"",
    rating:null,kd:null,adr:null,hs:null,win:null,matches:0,mvps:0,kills:0,deaths:0,
    firstKills:0,firstDeaths:0,clutches:0,teamHistory:[],demo:false
  }));
  // When logged in, the cloud database is authoritative for real profiles.
  players=[...cloud,...players.filter(p=>p.demo)];
  savePlayers();renderAll();
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
