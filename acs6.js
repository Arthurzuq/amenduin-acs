/* ACS 6.0 — team identity, image uploads and visual tournament board. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const tid = document.documentElement.dataset.acsTournamentId || "9a865495-77c1-439f-a468-0ad8d52634b7";
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const notify = m => typeof toast === "function" ? toast(m) : alert(m);
  const uuid = () => crypto.randomUUID();
  const imageMime = new Set(["image/png","image/jpeg"]);
  async function uploadImage(file, folder) {
    if (!file) return null;
    if (!imageMime.has(file.type)) throw new Error("Use somente PNG ou JPG.");
    if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
    if (!supabaseClient || !currentUser) throw new Error("Entre na sua conta para enviar imagens.");
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = folder + "/" + uuid() + "." + ext;
    const {error} = await supabaseClient.storage.from("acs-public-assets").upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
    if (error) throw error;
    return supabaseClient.storage.from("acs-public-assets").getPublicUrl(path).data.publicUrl;
  }
  window.ACS6 = {uploadImage};

  // Team creation was missing its submit handler in the current client build.
  $("#teamCreateForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser || !supabaseClient) { $("#authModal")?.classList.add("open"); return; }
    const button=$("#createTeamButton"); button.disabled=true;
    try {
      const {data:teamId,error}=await supabaseClient.rpc("acs_create_team",{
        p_name:$("#newTeamName").value.trim(),p_tag:$("#newTeamTag").value.trim()||null,p_capacity:null
      });
      if(error) throw error;
      let logoUrl=null;
      const file=$("#newTeamLogoFile")?.files?.[0];
      if(file) logoUrl=await uploadImage(file,"teams/"+teamId);
      const {error:updateError}=await supabaseClient.from("teams").update({
        logo_url:logoUrl,frame_color:$("#newTeamFrame").value,name_color:$("#newTeamNameColor").value
      }).eq("id",teamId);
      if(updateError) throw updateError;
      e.target.reset();
      notify("Equipe criada e personalizada.");
      await loadCloudPlayers(); await loadTeamsData();
    } catch(err) { notify("Não foi possível criar a equipe: "+(err?.message||"erro inesperado")); }
    finally { button.disabled=false; }
  });

  const oldRenderTeams=renderTeams;
  renderTeams=function(){
    oldRenderTeams();
    const host=$("#teamsList"); if(!host)return;
    host.innerHTML=cloudTeams.length?cloudTeams.map(team=>{
      const members=teamMembers.filter(m=>m.team_id===team.id);
      const own=currentPlayerProfile();
      const captain=team.captain_player_id===own?.id;
      const logo=team.logo_url?'<img src="'+esc(team.logo_url)+'" alt="Logo '+esc(team.name)+'" loading="lazy">':'<span>'+esc((team.tag||team.name||"ACS").slice(0,3).toUpperCase())+'</span>';
      return '<article class="team-profile-card profile-'+esc(team.frame_color||"blue")+'" data-team-profile="'+esc(team.id)+'">'+
        '<div class="team-profile-logo">'+logo+'</div><div class="team-profile-copy"><small>'+esc(team.tag||"ACS TEAM")+'</small><h3 class="name-'+esc(team.name_color||"white")+'">'+esc(team.name)+'</h3><p>Equipe competitiva · '+members.length+' integrante(s)</p></div>'+
        (captain?'<button class="btn btn-ghost btn-small" data-team-edit="'+esc(team.id)+'">Personalizar</button>':"")+(captain||isAdmin?'<button class="btn btn-danger btn-small" data-team-delete="'+esc(team.id)+'">Excluir</button>':"")+
      '</article>';
    }).join(""):'<div class="market-empty"><b>Nenhuma equipe cadastrada</b>As equipes aparecerão aqui depois de criadas.</div>';
    $$("[data-team-edit]").forEach(btn=>btn.addEventListener("click",()=>openTeamEditor(btn.dataset.teamEdit)));
    $$("[data-team-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteTeam(btn.dataset.teamDelete)));
    $$("[data-team-profile]").forEach(card=>card.addEventListener("click",e=>{
      if(e.target.closest("button"))return;
      openTeamProfile(card.dataset.teamProfile);
    }));
  };

  function ensureTeamModal(){
    if($("#teamProfileModal"))return;
    document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop" id="teamProfileModal"><div class="modal team-profile-modal"><div id="teamProfileContent"></div></div></div>');
    $("#teamProfileModal").addEventListener("click",e=>{if(e.target.id==="teamProfileModal"||e.target.closest("[data-team-close]"))$("#teamProfileModal").classList.remove("open");});
  }
  function openTeamProfile(id){
    const team=cloudTeams.find(t=>t.id===id);if(!team)return;
    ensureTeamModal();
    const logo=team.logo_url?'<img src="'+esc(team.logo_url)+'" alt="Logo da equipe">':'<span>'+esc((team.tag||team.name).slice(0,3).toUpperCase())+'</span>';
    $("#teamProfileContent").innerHTML='<div class="modal-head"><span class="eyebrow">TEAM PROFILE / ACS</span><button class="icon-button" data-team-close>×</button></div><div class="team-profile-detail profile-'+esc(team.frame_color||"blue")+'"><div class="team-profile-logo">'+logo+'</div><div><small>'+esc(team.tag||"ACS TEAM")+'</small><h2 class="name-'+esc(team.name_color||"white")+'">'+esc(team.name)+'</h2><p>Perfil oficial da equipe na Liga Amenduin.</p></div></div>';
    $("#teamProfileModal").classList.add("open");
  }
  function openTeamEditor(id){
    const team=cloudTeams.find(t=>t.id===id);if(!team)return;
    ensureTeamModal();
    const frame=(team.frame_color||"blue"),name=(team.name_color||"blue");
    $("#teamProfileContent").innerHTML='<div class="modal-head"><div><span class="eyebrow">TEAM CUSTOMIZATION</span><h2>PERSONALIZAR EQUIPE</h2></div><button class="icon-button" data-team-close>×</button></div>'+
      '<form id="teamEditForm" class="team-edit-form"><label class="field">NOME<input name="name" maxlength="40" required value="'+esc(team.name)+'"></label><label class="field">TAG<input name="tag" maxlength="6" value="'+esc(team.tag||"")+'"></label>'+
      '<label class="field">FOTO DA EQUIPE (PNG/JPG)<input name="logo" type="file" accept="image/png,image/jpeg"></label><label class="field">MOLDURA<select name="frame">'+["blue","red","green","yellow"].map(v=>'<option value="'+v+'" '+(frame===v?"selected":"")+'>'+({blue:"Azul",red:"Vermelho",green:"Verde",yellow:"Amarelo"}[v])+'</option>').join("")+'</select></label>'+
      '<label class="field">COR DO NOME<select name="nameColor">'+["black","red","green","blue","white","yellow"].map(v=>'<option value="'+v+'" '+(name===v?"selected":"")+'>'+({black:"Preto",red:"Vermelho",green:"Verde",blue:"Azul",white:"Branco",yellow:"Amarelo"}[v])+'</option>').join("")+'</select></label>'+
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-team-close>Cancelar</button><button class="btn btn-primary" type="submit">Salvar personalização</button></div></form>';
    $("#teamProfileModal").classList.add("open");
    $("#teamEditForm").addEventListener("submit",async e=>{
      e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
      try{
        const fd=new FormData(form);let logoUrl=team.logo_url||null;
        const file=fd.get("logo");if(file?.size)logoUrl=await uploadImage(file,"teams/"+team.id);
        const {error}=await supabaseClient.from("teams").update({name:String(fd.get("name")).trim(),tag:String(fd.get("tag")).trim()||null,logo_url:logoUrl,frame_color:fd.get("frame"),name_color:fd.get("nameColor")}).eq("id",team.id);
        if(error)throw error;
        $("#teamProfileModal").classList.remove("open");notify("Perfil da equipe atualizado.");await loadTeamsData();
      }catch(err){notify("Falha ao atualizar a equipe: "+(err?.message||"erro"));}
      finally{button.disabled=false;}
    });
  }

  // Visual board document. The canvas is deliberately free-form; no bracket format is forced.
  let board={version:1,nodes:[],edges:[]},approvedTeams=[],boardStageId=null,pendingOutput=null,saveTimer=null,boardBusy=false,suppressTrayClick=false;
  const canvas=()=>$("#tournamentBoardCanvas");
  const nodeById=id=>board.nodes.find(n=>n.id===id);
  const teamById=id=>approvedTeams.find(t=>t.id===id)||cloudTeams.find(t=>t.id===id)||{id,name:"Equipe"};
  const pairings=ids=>{
    const list=[...ids],fixtures=[];if(list.length%2)list.push(null);
    const n=list.length;
    for(let round=0;round<n-1;round++){
      for(let i=0;i<n/2;i++){const a=list[i],b=list[n-1-i];if(a&&b)fixtures.push({id:uuid(),teamA:a,teamB:b,round:round+1});}
      list.splice(1,0,list.pop());
    }
    return fixtures;
  };
  async function loadBoard(){
    if(!supabaseClient)return;
    $("#boardSaveState").textContent="Carregando quadro...";
    const [teamsRes,docRes,stageRes]=await Promise.all([
      supabaseClient.from("tournament_registrations").select("team_id,teams(id,name,tag,logo_url,frame_color,name_color)").eq("tournament_id",tid).eq("status","approved"),
      supabaseClient.from("tournament_board_documents").select("board_json,updated_at").eq("tournament_id",tid).maybeSingle(),
      supabaseClient.from("tournament_stages").select("id,name,stage_order").eq("tournament_id",tid).eq("name","Quadro personalizado").maybeSingle()
    ]);
    if(teamsRes.error){$("#boardSaveState").textContent="Erro ao carregar equipes: "+teamsRes.error.message;return;}
    approvedTeams=(teamsRes.data||[]).map(r=>r.teams).filter(Boolean);
    board=docRes.data?.board_json||{version:1,nodes:[],edges:[]};
    if(!Array.isArray(board.nodes))board.nodes=[];
    if(!Array.isArray(board.edges))board.edges=[];
    boardStageId=stageRes.data?.id||null;
    renderBoard();
    $("#boardSaveState").textContent=docRes.data?.updated_at?"Última edição: "+new Date(docRes.data.updated_at).toLocaleString("pt-BR"):"Quadro ainda não salvo.";
  }
  function renderBoard(){
    const tray=$("#tournamentTeamTray"),count=$("#boardTeamCount"),nodes=$("#tournamentBoardNodes"),empty=$(".board-empty-hint");
    if(!tray||!nodes)return;
    const used=new Set(board.nodes.flatMap(n=>n.teamIds||[]));
    const available=approvedTeams.filter(t=>!used.has(t.id));
    count.textContent=approvedTeams.length+" equipe(s)";
    tray.innerHTML=available.length?available.map(t=>'<button class="board-team-chip profile-'+esc(t.frame_color||"blue")+'" data-tray-team="'+esc(t.id)+'"><span class="board-chip-logo">'+(t.logo_url?'<img src="'+esc(t.logo_url)+'" alt="">':esc((t.tag||t.name).slice(0,2).toUpperCase()))+'</span><b class="name-'+esc(t.name_color||"white")+'">'+esc(t.name)+'</b><small>Arraste para o quadro</small></button>').join(""):'<div class="market-empty">Todas as equipes aprovadas já estão no quadro.</div>';
    nodes.innerHTML=board.nodes.map(n=>{
      const teams=(n.teamIds||[]).map(id=>teamById(id));
      const title=n.type==="group"?"FASE DE GRUPOS":n.type==="match"?"PARTIDA":"EQUIPE";
      const participants=teams.map(t=>'<div class="board-match-team"><span>'+(t.logo_url?'<img src="'+esc(t.logo_url)+'" alt="">':esc((t.tag||t.name).slice(0,2).toUpperCase()))+'</span><b>'+esc(t.name)+'</b></div>').join("");
      const outs=n.type==="match"?'<div class="board-connectors"><button data-connect-out="winner" data-node-id="'+n.id+'">Vencedor →</button><button data-connect-out="loser" data-node-id="'+n.id+'">Perdedor →</button></div>':n.type==="group"?'<div class="board-connectors">'+(n.teamIds||[]).slice(0,8).map((_,i)=>'<button data-connect-out="place_'+(i+1)+'" data-node-id="'+n.id+'">'+(i+1)+'º lugar →</button>').join("")+'</div>':'';
      const ins=n.type==="match"?'<div class="board-inputs"><button data-connect-in="A" data-node-id="'+n.id+'">＋ Entrada A</button><button data-connect-in="B" data-node-id="'+n.id+'">＋ Entrada B</button></div>':'';
      const fixtures=n.type==="group"?'<div class="board-group-fixtures">'+(n.fixtures||[]).map((f,i)=>'<div>'+esc(teamById(f.teamA).name)+' <span>×</span> '+esc(teamById(f.teamB).name)+'</div>').join("")+'</div><small class="board-group-note">Todos se enfrentam uma vez. Cada vitória vale 3 pontos.</small>':"";
      return '<article class="board-node board-node-'+n.type+'" data-board-node="'+n.id+'" style="left:'+Number(n.x||40)+'px;top:'+Number(n.y||40)+'px">'+
        '<header><span>'+title+'</span><button data-delete-board-node="'+n.id+'" title="Remover">×</button></header>'+
        '<div class="board-node-teams">'+(participants||'<p>Arraste equipes para cá</p>')+'</div>'+fixtures+ins+outs+
        (pendingOutput?.id===n.id?'<small class="board-pending">Escolha uma entrada no próximo jogo.</small>':"")+'</article>';
    }).join("");
    if(empty)empty.style.display=board.nodes.length?"none":"block";
    drawWires();
    bindBoardControls();
  }
  function drawWires(){
    const svg=$("#tournamentBoardWires"),c=canvas();if(!svg||!c)return;
    const width=Math.max(c.scrollWidth,c.clientWidth),height=Math.max(c.scrollHeight,c.clientHeight);
    svg.setAttribute("width",width);svg.setAttribute("height",height);svg.setAttribute("viewBox","0 0 "+width+" "+height);
    const paths=board.edges.map(e=>{
      const from=nodeById(e.from),to=nodeById(e.to);if(!from||!to)return "";
      const x1=Number(from.x||0)+250,y1=Number(from.y||0)+85,x2=Number(to.x||0),y2=Number(to.y||0)+75+(e.slot==="B"?35:0),mid=(x1+x2)/2;
      return '<path d="M '+x1+' '+y1+' C '+mid+' '+y1+', '+mid+' '+y2+', '+x2+' '+y2+'" marker-end="url(#boardArrow)"/><text x="'+mid+'" y="'+((y1+y2)/2-8)+'">'+esc(e.result==="winner"?"Vencedor":e.result==="loser"?"Perdedor":e.result.replace("place_","")+"º lugar")+'</text>';
    }).join("");
    svg.innerHTML='<defs><marker id="boardArrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker></defs>'+paths;
  }
  function bindBoardControls(){
    $$("[data-tray-team]").forEach(btn=>{
      btn.addEventListener("click",()=>{if(suppressTrayClick){suppressTrayClick=false;return;}addSolo(btn.dataset.trayTeam,80+board.nodes.length*28,70+board.nodes.length*22);});
      btn.addEventListener("pointerdown",e=>startBoardDrag(e,{kind:"team",teamId:btn.dataset.trayTeam}));
    });
    $$("[data-board-node]").forEach(el=>el.addEventListener("pointerdown",e=>{
      if(e.target.closest("button"))return;
      startBoardDrag(e,{kind:"node",nodeId:el.dataset.boardNode});
    }));
    $$("[data-delete-board-node]").forEach(btn=>btn.addEventListener("click",()=>{
      const id=btn.dataset.deleteBoardNode;board.nodes=board.nodes.filter(n=>n.id!==id);board.edges=board.edges.filter(e=>e.from!==id&&e.to!==id);queueSave();
    }));
    $$("[data-connect-out]").forEach(btn=>btn.addEventListener("click",()=>{
      pendingOutput={id:btn.dataset.nodeId,result:btn.dataset.connectOut};renderBoard();
      $("#boardSaveState").textContent="Agora escolha a entrada A ou B de uma partida.";
    }));
    $$("[data-connect-in]").forEach(btn=>btn.addEventListener("click",()=>{
      if(!pendingOutput){notify("Primeiro escolha uma saída de vencedor, perdedor ou posição.");return;}
      const target=btn.dataset.nodeId,slot=btn.dataset.connectIn;
      if(pendingOutput.id===target){notify("Uma fase não pode apontar para ela mesma.");return;}
      board.edges=board.edges.filter(e=>!(e.to===target&&e.slot===slot)&&!(e.from===pendingOutput.id&&e.result===pendingOutput.result));
      board.edges.push({id:uuid(),from:pendingOutput.id,result:pendingOutput.result,to:target,slot});
      pendingOutput=null;queueSave();
    }));
  }
  let dragState=null;
  function startBoardDrag(e,payload){
    if(e.button!==0)return;
    dragState={...payload,startX:e.clientX,startY:e.clientY,moved:false};
    const move=ev=>{
      if(!dragState)return;
      if(Math.abs(ev.clientX-dragState.startX)+Math.abs(ev.clientY-dragState.startY)>7)dragState.moved=true;
    };
    const up=ev=>{
      document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);
      const state=dragState;dragState=null;if(!state||!state.moved)return;suppressTrayClick=state.kind==="team";
      const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-board-node]");
      if(state.kind==="team"){
        if(target)mergeTeamIntoNode(state.teamId,target.dataset.boardNode);
        else{
          const r=canvas().getBoundingClientRect();
          addSolo(state.teamId,Math.max(20,ev.clientX-r.left+canvas().scrollLeft-110),Math.max(20,ev.clientY-r.top+canvas().scrollTop-35));
        }
      }else{
        const n=nodeById(state.nodeId);if(!n)return;
        const r=canvas().getBoundingClientRect();n.x=Math.max(10,ev.clientX-r.left+canvas().scrollLeft-110);n.y=Math.max(10,ev.clientY-r.top+canvas().scrollTop-35);queueSave();
      }
    };
    document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
  }
  function addSolo(teamId,x,y){
    if(board.nodes.some(n=>(n.teamIds||[]).includes(teamId)))return;
    board.nodes.push({id:uuid(),type:"solo",teamIds:[teamId],x,y});queueSave();
  }
  function mergeTeamIntoNode(teamId,nodeId){
    if(board.nodes.some(n=>(n.teamIds||[]).includes(teamId)))return;
    const n=nodeById(nodeId);if(!n)return;
    if(n.type==="solo"){n.type="match";n.teamIds=[...(n.teamIds||[]),teamId];}
    else if(n.type==="match"||n.type==="group"){
      const previous=new Map((n.fixtures||[]).map(f=>[[f.teamA,f.teamB].sort().join(":"),f.id]));
      n.type="group";n.teamIds=[...(n.teamIds||[]),teamId];n.fixtures=pairings(n.teamIds).map(f=>({...f,id:previous.get([f.teamA,f.teamB].sort().join(":"))||f.id}));delete n.bracketId;
    }
    queueSave();
  }
  async function syncBracketRows(){
    const games=board.nodes.filter(n=>n.type==="match");
    const groups=board.nodes.filter(n=>n.type==="group");
    if(!games.length&&!groups.length)return;
    if(!boardStageId){
      const {data:last}=await supabaseClient.from("tournament_stages").select("stage_order").eq("tournament_id",tid).order("stage_order",{ascending:false}).limit(1);
      const {data,error}=await supabaseClient.from("tournament_stages").insert({tournament_id:tid,stage_order:Number(last?.[0]?.stage_order||0)+1,name:"Quadro personalizado",format:"single_elimination",status:"draft",config:{editor:"custom_board"}}).select("id").single();
      if(error)throw error;boardStageId=data.id;
    }
    let mainNo=0,groupNo=0;const rows=[];
    games.forEach(n=>{
      n.bracketId=n.bracketId||n.id;mainNo++;
      const incomingA=board.edges.find(e=>e.to===n.id&&e.slot==="A"),incomingB=board.edges.find(e=>e.to===n.id&&e.slot==="B");
      rows.push({id:n.bracketId,tournament_id:tid,stage_id:boardStageId,bracket_side:"main",round_number:1,match_number:parseInt(n.id.replace(/-/g,"").slice(0,7),16),team_a_id:incomingA?null:(n.teamIds?.[0]||null),team_b_id:incomingB?null:(n.teamIds?.[1]||null),
        team_a_source_node_id:incomingA&&["winner","loser"].includes(incomingA.result)?incomingA.from:null,team_a_source_result:incomingA&&["winner","loser"].includes(incomingA.result)?incomingA.result:null,
        team_b_source_node_id:incomingB&&["winner","loser"].includes(incomingB.result)?incomingB.from:null,team_b_source_result:incomingB&&["winner","loser"].includes(incomingB.result)?incomingB.result:null,
        status:((incomingA||n.teamIds?.[0])&&(incomingB||n.teamIds?.[1]))?"ready":"pending",config:{board_node_id:n.id}});
    });
    groups.forEach(g=>(g.fixtures||[]).forEach(f=>{
      f.bracketId=f.bracketId||f.id;groupNo++;
      rows.push({id:f.bracketId,tournament_id:tid,stage_id:boardStageId,bracket_side:"groups",round_number:1,match_number:parseInt(f.id.replace(/-/g,"").slice(0,7),16),team_a_id:f.teamA,team_b_id:f.teamB,status:"ready",config:{group_node_id:g.id,round:f.round}});
    }));
    if(rows.length){
      const {error}=await supabaseClient.from("tournament_bracket_nodes").upsert(rows,{onConflict:"id"});
      if(error)throw error;
    }
    for(const group of groups){
      const {data:groupRows,error:groupError}=await supabaseClient.from("tournament_bracket_nodes")
        .select("team_a_id,team_b_id,winner_team_id,config").eq("tournament_id",tid).eq("bracket_side","groups");
      if(groupError)throw groupError;
      const played=(groupRows||[]).filter(row=>row.config?.group_node_id===group.id);
      if(!played.length||played.some(row=>!row.winner_team_id))continue;
      const tally=new Map((group.teamIds||[]).map(id=>[id,{id,points:0,wins:0}]));
      played.forEach(row=>{const winner=tally.get(row.winner_team_id);if(winner){winner.points+=3;winner.wins++;}});
      const ranking=[...tally.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||teamById(a.id).name.localeCompare(teamById(b.id).name));
      for(const edge of board.edges.filter(item=>item.from===group.id&&item.result.startsWith("place_"))){
        const target=nodeById(edge.to),team=ranking[Number(edge.result.slice(6))-1]?.id;
        if(!target?.bracketId||!team)continue;
        const {data:targetRow,error:targetError}=await supabaseClient.from("tournament_bracket_nodes").select("team_a_id,team_b_id").eq("id",target.bracketId).single();
        if(targetError)throw targetError;
        const team_a_id=edge.slot==="A"?team:targetRow.team_a_id;
        const team_b_id=edge.slot==="B"?team:targetRow.team_b_id;
        const {error}=await supabaseClient.from("tournament_bracket_nodes").update({team_a_id,team_b_id,status:team_a_id&&team_b_id?"ready":"pending"}).eq("id",target.bracketId);
        if(error)throw error;
      }
    }
    for(const e of board.edges){
      const source=nodeById(e.from),target=nodeById(e.to);
      if(!source||!target||source.type!=="match"||!target.bracketId||!["winner","loser"].includes(e.result))continue;
      const field=e.result==="winner"?"next_winner":"next_loser";
      const {error}=await supabaseClient.from("tournament_bracket_nodes").update({
        [field+"_node_id"]:target.bracketId,[field+"_slot"]:e.slot
      }).eq("id",source.bracketId);
      if(error)throw error;
    }
  }
  async function saveBoard(){
    if(!isAdmin||!currentUser||!supabaseClient){notify("Entre como administrador para salvar o quadro.");return;}
    if(boardBusy)return;boardBusy=true;$("#boardSaveButton").disabled=true;$("#boardSaveState").textContent="Salvando...";
    try{
      await syncBracketRows();
      const {error}=await supabaseClient.from("tournament_board_documents").upsert({tournament_id:tid,board_json:board,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"tournament_id"});
      if(error)throw error;
      $("#boardSaveState").textContent="Organização salva · "+new Date().toLocaleTimeString("pt-BR");
    }catch(err){$("#boardSaveState").textContent="Falha ao salvar: "+(err?.message||"erro");}
    finally{boardBusy=false;$("#boardSaveButton").disabled=false;}
  }
  function queueSave(){
    renderBoard();$("#boardSaveState").textContent="Alterações pendentes...";
    clearTimeout(saveTimer);saveTimer=setTimeout(saveBoard,650);
  }
  async function openBoard(){
    if(!isAdmin){notify("Somente administradores podem organizar o campeonato.");return;}
    go("tournament-board");
  }
  window.ACS6.openBoard=openBoard;
  $("#boardSaveButton")?.addEventListener("click",saveBoard);
  $("#boardBackButton")?.addEventListener("click",()=>go("tournaments"));
  $("#boardClearButton")?.addEventListener("click",()=>{
    if(!confirm("Limpar todos os elementos do quadro? A organização salva será substituída."))return;
    board={version:1,nodes:[],edges:[]};pendingOutput=null;queueSave();
  });
  $("#boardSuggestButton")?.addEventListener("click",()=>{
    if(board.nodes.length){notify("O quadro já contém elementos. Limpe-o antes de gerar uma sugestão.");return;}
    if(approvedTeams.length<2){notify("São necessárias pelo menos duas equipes aprovadas.");return;}
    if(approvedTeams.length>=3){
      const ids=approvedTeams.map(t=>t.id),group={id:uuid(),type:"group",teamIds:ids,x:70,y:60,fixtures:pairings(ids)};
      board.nodes.push(group);
    }else{
      board.nodes.push({id:uuid(),type:"match",teamIds:approvedTeams.map(t=>t.id),x:100,y:90});
    }
    queueSave();
  });
  const oldGo=go;
  go=function(page){oldGo(page);if(page==="tournament-board")loadBoard();};
})();