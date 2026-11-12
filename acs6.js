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
      return '<article class="team-profile-card profile-'+esc(team.frame_color||"blue")+' '+(window.ACS8Cosmetics?.classFor(team.frame_style)||"")+' '+(window.ACS8Cosmetics?.classFor(team.background_style)||"")+'" data-team-profile="'+esc(team.id)+'">'+
        '<div class="team-profile-logo">'+logo+'</div><div class="team-profile-copy"><small>'+esc(team.tag||"ACS TEAM")+'</small><h3 class="name-'+esc(team.name_color||"white")+' '+(window.ACS8Cosmetics?.classFor(team.name_style)||"")+'">'+esc(team.name)+'</h3><p>Equipe competitiva · '+members.length+' integrante(s)</p></div>'+
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
    $("#teamProfileContent").innerHTML='<div class="modal-head"><span class="eyebrow">TEAM PROFILE / ACS</span><button class="icon-button" data-team-close>×</button></div><div class="team-profile-detail profile-'+esc(team.frame_color||"blue")+' '+(window.ACS8Cosmetics?.classFor(team.frame_style)||"")+' '+(window.ACS8Cosmetics?.classFor(team.background_style)||"")+'"><div class="team-profile-logo">'+logo+'</div><div><small>'+esc(team.tag||"ACS TEAM")+'</small><h2 class="name-'+esc(team.name_color||"white")+' '+(window.ACS8Cosmetics?.classFor(team.name_style)||"")+'">'+esc(team.name)+'</h2><p>Perfil oficial da equipe na Liga Amenduin.</p></div></div>';
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
      '<div id="teamCosmeticShop" class="cosmetic-shop-host"></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-team-close>Cancelar</button><button class="btn btn-primary" type="submit">Salvar personalização</button></div></form>';
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
    window.ACS8Cosmetics?.renderEditor("team",team.id,$("#teamCosmeticShop"));
  }

  // Tournament bracket builder: create every match box first, connect result ports, then seed initial slots.
  let board={version:2,nodes:[],edges:[]},approvedTeams=[],boardStageId=null,pendingOutput=null,selectedTeamId=null,saveTimer=null,boardBusy=false,suppressTrayClick=false,dragState=null,connectionDrag=null,suppressConnectorClick=false,bracketRows=[];
  const canvas=()=>$("#tournamentBoardCanvas");
  const nodeById=id=>board.nodes.find(n=>n.id===id);
  const teamById=id=>approvedTeams.find(t=>t.id===id)||cloudTeams.find(t=>t.id===id)||{id,name:"Equipe"};
  const rowForNode=id=>{
    const node=nodeById(id);
    return bracketRows.find(r=>r.config?.board_node_id===id||r.id===node?.bracketId||r.id===id)||null;
  };
  const incomingFor=(nodeId,slot)=>board.edges.find(e=>e.to===nodeId&&e.slot===slot)||null;
  function normalizeBoard(){
    if(!board||typeof board!=="object")board={version:2,nodes:[],edges:[]};
    if(!Array.isArray(board.nodes))board.nodes=[];
    if(!Array.isArray(board.edges))board.edges=[];
    board.nodes=board.nodes.map((node,index)=>{
      const next={...node};
      if(next.type==="solo")next.type="match";
      if(next.type!=="group")next.type="match";
      next.slots=next.slots&&typeof next.slots==="object"
        ?{A:next.slots.A||null,B:next.slots.B||null}
        :{A:next.teamIds?.[0]||null,B:next.teamIds?.[1]||null};
      next.x=Number.isFinite(Number(next.x))?Number(next.x):70+(index%4)*390;
      next.y=Number.isFinite(Number(next.y))?Number(next.y):70+Math.floor(index/4)*230;
      return next;
    });
    board.version=2;
  }
  async function loadBoard(){
    if(!supabaseClient)return;
    $("#boardSaveState").textContent="Carregando estrutura...";
    const [teamsRes,docRes,stageRes,rowsRes]=await Promise.all([
      supabaseClient.from("tournament_registrations").select("team_id,teams(id,name,tag,logo_url,frame_color,name_color)").eq("tournament_id",tid).eq("status","approved"),
      supabaseClient.from("tournament_board_documents").select("board_json,updated_at").eq("tournament_id",tid).maybeSingle(),
      supabaseClient.from("tournament_stages").select("id,name,stage_order").eq("tournament_id",tid).eq("name","Quadro personalizado").maybeSingle(),
      supabaseClient.from("tournament_bracket_nodes").select("*").eq("tournament_id",tid).eq("bracket_side","main")
    ]);
    if(teamsRes.error){$("#boardSaveState").textContent="Erro ao carregar equipes: "+teamsRes.error.message;return;}
    if(docRes.error){$("#boardSaveState").textContent="Erro ao carregar o quadro: "+docRes.error.message;return;}
    if(stageRes.error){$("#boardSaveState").textContent="Erro ao carregar a fase: "+stageRes.error.message;return;}
    if(rowsRes.error){$("#boardSaveState").textContent="Erro ao carregar os resultados: "+rowsRes.error.message;return;}
    approvedTeams=(teamsRes.data||[]).map(r=>r.teams).filter(Boolean);
    board=docRes.data?.board_json||{version:2,nodes:[],edges:[]};
    normalizeBoard();
    boardStageId=stageRes.data?.id||null;
    bracketRows=(rowsRes.data||[]).filter(row=>!boardStageId||row.stage_id===boardStageId);
    selectedTeamId=null;pendingOutput=null;
    renderBoard();
    $("#boardSaveState").textContent=docRes.data?.updated_at
      ?"Última edição: "+new Date(docRes.data.updated_at).toLocaleString("pt-BR")
      :"Crie as partidas e conecte os caminhos antes de posicionar as equipes.";
  }
  function nodeLabel(node){
    const index=board.nodes.filter(n=>n.type!=="group").indexOf(node)+1;
    return node.label||("PARTIDA "+String(index).padStart(2,"0"));
  }
  function resultLabel(result){
    return result==="winner"?"Vencedor":result==="loser"?"Perdedor":String(result||"").replace("place_","")+"º lugar";
  }
  function slotMarkup(node,slot){
    const edge=incomingFor(node.id,slot);
    const row=rowForNode(node.id);
    const teamId=row?(slot==="A"?row.team_a_id:row.team_b_id):null;
    const source=edge?nodeById(edge.from):null;
    const resolvedTeamId=edge?teamId:(node.slots?.[slot]||null);
    const team=resolvedTeamId?teamById(resolvedTeamId):null;
    const detail=edge
      ?(team?team.name:("Aguardando "+resultLabel(edge.result).toLowerCase()+" de "+(source?nodeLabel(source):"outra partida")))
      :(team?team.name:"Arraste um time aprovado para esta vaga");
    const logo=team?(team.logo_url?'<img src="'+esc(team.logo_url)+'" alt="">':esc((team.tag||team.name||"ACS").slice(0,2).toUpperCase())):"＋";
    const kind=edge?"linked":"initial";
    return '<div class="board-slot-wrap">'+
      '<button type="button" class="board-slot board-slot-'+kind+(team?" board-slot-filled":"")+(selectedTeamId&&!edge?" board-slot-ready":"")+'" data-connect-in="'+slot+'" data-node-id="'+esc(node.id)+'"'+(edge?' data-slot-linked="true"':' data-team-slot="'+slot+'"')+'>'+
        '<span class="board-slot-side">'+slot+'</span><span class="board-slot-logo">'+logo+'</span>'+
        '<span class="board-slot-copy"><b>'+esc(detail)+'</b><small>'+(edge?(team?"Classificada automaticamente":"Conectada · aguarda o placar"):(team?"Vaga inicial · clique para remover ou substituir":"VAGA INICIAL · receba um time aqui"))+'</small></span>'+
        (edge?'<span class="board-slot-link">↖</span>':'')+
      '</button>'+
      (!edge&&team?'<button type="button" class="board-slot-clear" data-clear-team-slot="'+slot+'" data-node-id="'+esc(node.id)+'" title="Remover equipe desta vaga">×</button>':'')+
    '</div>';
  }
  function renderBoard(){
    const tray=$("#tournamentTeamTray"),count=$("#boardTeamCount"),nodes=$("#tournamentBoardNodes"),empty=$(".board-empty-hint");
    if(!tray||!nodes)return;
    const assigned=new Set();
    board.nodes.filter(n=>n.type!=="group").forEach(n=>{
      ["A","B"].forEach(slot=>{if(!incomingFor(n.id,slot)&&n.slots?.[slot])assigned.add(n.slots[slot]);});
    });
    const available=approvedTeams.filter(t=>!assigned.has(t.id));
    count.textContent=approvedTeams.length+" equipe(s) aprovadas";
    tray.innerHTML=available.length?available.map(t=>
      '<button type="button" class="board-team-chip profile-'+esc(t.frame_color||"blue")+(selectedTeamId===t.id?" selected":"")+'" data-tray-team="'+esc(t.id)+'">'+
        '<span class="board-chip-logo">'+(t.logo_url?'<img src="'+esc(t.logo_url)+'" alt="">':esc((t.tag||t.name).slice(0,2).toUpperCase()))+'</span>'+
        '<b class="name-'+esc(t.name_color||"white")+'">'+esc(t.name)+'</b><small>'+(selectedTeamId===t.id?"Selecionado · clique numa vaga inicial":"Arraste ou selecione")+'</small></button>'
    ).join(""):'<div class="market-empty">Todos os times aprovados já foram posicionados nas vagas iniciais.</div>';
    nodes.innerHTML=board.nodes.map(n=>{
      if(n.type==="group"){
        const teamNames=(n.teamIds||[]).map(id=>teamById(id).name);
        return '<article class="board-node board-node-group" data-board-node="'+esc(n.id)+'" style="left:'+n.x+'px;top:'+n.y+'px">'+
          '<header data-board-drag-handle><span>FASE DE GRUPOS</span><button type="button" data-delete-board-node="'+esc(n.id)+'" title="Remover">×</button></header>'+
          '<div class="board-node-teams"><p>'+esc(teamNames.join(" · ")||"Grupo legado")+'</p></div>'+
          '<small class="board-legacy-note">Grupo criado na versão anterior do organizador.</small></article>';
      }
      const row=rowForNode(n.id);
      const state=row?.status==="completed"?"CONCLUÍDA":row?.status==="ready"?"PRONTA PARA PLACAR":"AGUARDANDO TIMES";
      const winner=row?.winner_team_id?teamById(row.winner_team_id).name:null;
      const loser=row?.winner_team_id?teamById(row.winner_team_id===row.team_a_id?row.team_b_id:row.team_a_id).name:null;
      const outgoing=board.edges.filter(e=>e.from===n.id);
      const loserEdge=outgoing.find(e=>e.result==="loser");
      const resultSummary=row?.status==="completed"
        ?'<div class="board-match-result"><b>Vencedor: '+esc(winner||"—")+'</b><small>Perdedor: '+esc(loser||"—")+(loserEdge?" · encaminhado":" · eliminado")+'</small></div>'
        :'';
      return '<article class="board-node board-node-match" data-board-node="'+esc(n.id)+'" style="left:'+n.x+'px;top:'+n.y+'px">'+
        '<header data-board-drag-handle><span>'+esc(nodeLabel(n))+'</span><span class="board-node-status '+(row?.status==="completed"?"done":row?.status==="ready"?"ready":"")+'">'+state+'</span><button type="button" data-delete-board-node="'+esc(n.id)+'" title="Remover">×</button></header>'+
        '<div class="board-node-slots">'+slotMarkup(n,"A")+slotMarkup(n,"B")+'</div>'+resultSummary+
        '<div class="board-connectors">'+
          '<button type="button" class="board-output '+(pendingOutput?.id===n.id&&pendingOutput.result==="winner"?"active":"")+'" data-connect-out="winner" data-node-id="'+esc(n.id)+'" title="Arraste até uma vaga de outra partida ou clique para selecionar">↗ Vencedor</button>'+
          '<button type="button" class="board-output '+(pendingOutput?.id===n.id&&pendingOutput.result==="loser"?"active":"")+'" data-connect-out="loser" data-node-id="'+esc(n.id)+'" title="Arraste até uma vaga de outra partida ou clique para selecionar">↘ Perdedor</button>'+
        '</div></article>';
    }).join("");
    if(empty)empty.style.display=board.nodes.length?"none":"block";
    drawWires();
    bindBoardControls();
  }
  function drawWires(){
    const svg=$("#tournamentBoardWires"),c=canvas();if(!svg||!c)return;
    const rect=c.getBoundingClientRect();
    const width=Math.max(c.scrollWidth,c.clientWidth),height=Math.max(c.scrollHeight,c.clientHeight);
    svg.setAttribute("width",width);svg.setAttribute("height",height);svg.setAttribute("viewBox","0 0 "+width+" "+height);
    const paths=board.edges.map(e=>{
      const from=$$("[data-connect-out]").find(el=>el.dataset.nodeId===e.from&&el.dataset.connectOut===e.result);
      const to=$$("[data-connect-in]").find(el=>el.dataset.nodeId===e.to&&el.dataset.connectIn===e.slot);
      if(!from||!to)return "";
      const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
      const x1=a.right-rect.left+c.scrollLeft,y1=a.top+a.height/2-rect.top+c.scrollTop;
      const x2=b.left-rect.left+c.scrollLeft,y2=b.top+b.height/2-rect.top+c.scrollTop;
      const mid=Math.max(x1+40,(x1+x2)/2);
      return '<path class="board-wire" d="M '+x1+' '+y1+' C '+mid+' '+y1+', '+mid+' '+y2+', '+x2+' '+y2+'" marker-end="url(#boardArrow)"/>'+
        '<text x="'+mid+'" y="'+((y1+y2)/2-7)+'">'+esc(resultLabel(e.result))+'</text>';
    }).join("");
    let temporary="";
    if(connectionDrag){
      const port=$$("[data-connect-out]").find(el=>el.dataset.nodeId===connectionDrag.id&&el.dataset.connectOut===connectionDrag.result);
      if(port){
        const a=port.getBoundingClientRect(),x1=a.right-rect.left+c.scrollLeft,y1=a.top+a.height/2-rect.top+c.scrollTop;
        const x2=connectionDrag.clientX-rect.left+c.scrollLeft,y2=connectionDrag.clientY-rect.top+c.scrollTop,mid=Math.max(x1+35,(x1+x2)/2);
        temporary='<path class="board-wire board-wire-draft" d="M '+x1+' '+y1+' C '+mid+' '+y1+', '+mid+' '+y2+', '+x2+' '+y2+'"/>';
      }
    }
    svg.innerHTML='<defs><marker id="boardArrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker></defs>'+paths+temporary;
  }
  function validateConnection(from,result,to,slot,allowCompleted){
    if(from===to){notify("Uma partida não pode alimentar uma vaga dela mesma.");return false;}
    if(!nodeById(from)||!nodeById(to)){notify("Partida de origem ou destino não encontrada.");return false;}
    if(!["winner","loser"].includes(result)||!["A","B"].includes(slot)){notify("Tipo de conexão inválido.");return false;}
    const seen=new Set();
    const reaches=(current,target)=>{
      if(current===target)return true;
      if(seen.has(current))return false;
      seen.add(current);
      return board.edges.filter(e=>e.from===current).some(e=>reaches(e.to,target));
    };
    if(reaches(to,from)){notify("Essa ligação criaria um ciclo no chaveamento.");return false;}
    const row=rowForNode(from);
    if(!allowCompleted&&row?.status==="completed"){notify("Esta partida já tem resultado. Não altere suas saídas.");return false;}
    return true;
  }
  function connectOutputToSlot(targetId,slot){
    if(!pendingOutput)return false;
    const from=pendingOutput.id,result=pendingOutput.result;
    if(!validateConnection(from,result,targetId,slot))return false;
    const target=nodeById(targetId);
    if(target?.slots)target.slots[slot]=null;
    board.edges=board.edges.filter(e=>!(e.to===targetId&&e.slot===slot)&&!(e.from===from&&e.result===result));
    board.edges.push({id:uuid(),from,result,to:targetId,slot});
    pendingOutput=null;selectedTeamId=null;queueSave();return true;
  }
  function bindBoardControls(){
    $$("[data-tray-team]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        if(suppressTrayClick){suppressTrayClick=false;return;}
        selectedTeamId=selectedTeamId===btn.dataset.trayTeam?null:btn.dataset.trayTeam;
        pendingOutput=null;renderBoard();
      });
      btn.addEventListener("pointerdown",e=>startBoardDrag(e,{kind:"team",teamId:btn.dataset.trayTeam}));
    });
    $$("[data-board-drag-handle]").forEach(handle=>handle.addEventListener("pointerdown",e=>{
      if(e.target.closest("button"))return;
      startBoardDrag(e,{kind:"node",nodeId:handle.closest("[data-board-node]")?.dataset.boardNode});
    }));
    $$("[data-delete-board-node]").forEach(btn=>btn.addEventListener("click",()=>{
      const id=btn.dataset.deleteBoardNode,row=rowForNode(id);
      if(row?.match_id||row?.status==="completed"){notify("Não é possível remover uma partida que já possui resultado registrado.");return;}
      if(!confirm("Remover esta partida e as conexões ligadas a ela?"))return;
      board.nodes=board.nodes.filter(n=>n.id!==id);
      board.edges=board.edges.filter(e=>e.from!==id&&e.to!==id);
      pendingOutput=null;queueSave();
    }));
    $$("[data-connect-out]").forEach(btn=>{
      btn.addEventListener("pointerdown",e=>startConnectionDrag(e,{id:btn.dataset.nodeId,result:btn.dataset.connectOut}));
      btn.addEventListener("click",()=>{
        if(suppressConnectorClick){suppressConnectorClick=false;return;}
        pendingOutput={id:btn.dataset.nodeId,result:btn.dataset.connectOut};selectedTeamId=null;
        renderBoard();
        $("#boardSaveState").textContent="Saída selecionada: "+resultLabel(btn.dataset.connectOut)+". Clique numa entrada A/B ou arraste esta saída até ela.";
      });
    });
    $$("[data-connect-in]").forEach(btn=>btn.addEventListener("click",()=>{
      if(pendingOutput){connectOutputToSlot(btn.dataset.nodeId,btn.dataset.connectIn);return;}
      if(selectedTeamId&&!btn.dataset.slotLinked&&btn.dataset.teamSlot){
        setTeamInSlot(selectedTeamId,btn.dataset.nodeId,btn.dataset.teamSlot);return;
      }
    }));
    $$("[data-clear-team-slot]").forEach(btn=>btn.addEventListener("click",()=>{
      const node=nodeById(btn.dataset.nodeId);if(!node)return;
      node.slots[btn.dataset.clearTeamSlot]=null;queueSave();
    }));
  }
  function setTeamInSlot(teamId,nodeId,slot){
    const node=nodeById(nodeId);if(!node||incomingFor(nodeId,slot))return;
    const existing=board.nodes.find(n=>n.type!=="group"&&["A","B"].some(s=>n.slots?.[s]===teamId));
    if(existing){
      ["A","B"].forEach(s=>{if(existing.slots?.[s]===teamId)existing.slots[s]=null;});
    }
    node.slots[slot]=teamId;selectedTeamId=null;pendingOutput=null;queueSave();
  }
  function startConnectionDrag(e,payload){
    if(e.button!==0)return;
    e.preventDefault();
    connectionDrag={...payload,startX:e.clientX,startY:e.clientY,clientX:e.clientX,clientY:e.clientY,moved:false};
    const move=ev=>{
      if(!connectionDrag)return;
      if(Math.abs(ev.clientX-connectionDrag.startX)+Math.abs(ev.clientY-connectionDrag.startY)>7)connectionDrag.moved=true;
      connectionDrag.clientX=ev.clientX;connectionDrag.clientY=ev.clientY;drawWires();
    };
    const up=ev=>{
      document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);
      const state=connectionDrag;connectionDrag=null;
      if(!state?.moved){drawWires();return;}
      const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-connect-in]");
      if(target){
        pendingOutput={id:state.id,result:state.result};
        if(connectOutputToSlot(target.dataset.nodeId,target.dataset.connectIn))suppressConnectorClick=true;
      }else{
        pendingOutput={id:state.id,result:state.result};
        renderBoard();
        $("#boardSaveState").textContent="Solte a seta sobre uma vaga A/B. A saída também ficou selecionada para conexão por clique.";
      }
      drawWires();
    };
    document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
  }
  function startBoardDrag(e,payload){
    if(e.button!==0)return;
    dragState={...payload,startX:e.clientX,startY:e.clientY,moved:false};
    const move=ev=>{
      if(!dragState)return;
      if(Math.abs(ev.clientX-dragState.startX)+Math.abs(ev.clientY-dragState.startY)>7)dragState.moved=true;
    };
    const up=ev=>{
      document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);
      const state=dragState;dragState=null;
      if(!state||!state.moved)return;
      if(state.kind==="team"){
        suppressTrayClick=true;
        const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-team-slot]");
        if(!target){notify("Solte o time em uma vaga inicial A ou B, não no espaço vazio.");return;}
        setTeamInSlot(state.teamId,target.dataset.nodeId,target.dataset.teamSlot);
      }else if(state.kind==="node"){
        const node=nodeById(state.nodeId);if(!node)return;
        const r=canvas().getBoundingClientRect();
        node.x=Math.max(10,ev.clientX-r.left+canvas().scrollLeft-120);
        node.y=Math.max(10,ev.clientY-r.top+canvas().scrollTop-25);queueSave();
      }
    };
    document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
  }
  function addMatchNode(){
    const index=board.nodes.filter(n=>n.type!=="group").length;
    const node={id:uuid(),type:"match",slots:{A:null,B:null},x:65+(index%4)*390,y:55+Math.floor(index/4)*245};
    board.nodes.push(node);selectedTeamId=null;pendingOutput=null;queueSave();
  }
  function nodeRound(id,seen){
    const visited=seen||new Set();
    if(visited.has(id))return 1;
    visited.add(id);
    const incoming=board.edges.filter(e=>e.to===id);
    if(!incoming.length)return 1;
    return Math.max(...incoming.map(e=>nodeRound(e.from,new Set(visited))))+1;
  }
  async function syncBracketRows(){
    const games=board.nodes.filter(n=>n.type!=="group");
    const groups=board.nodes.filter(n=>n.type==="group");
    if(!games.length&&!groups.length&&!boardStageId)return;
    if(!boardStageId){
      const {data:last,error:lastError}=await supabaseClient.from("tournament_stages").select("stage_order").eq("tournament_id",tid).order("stage_order",{ascending:false}).limit(1);
      if(lastError)throw lastError;
      const {data,error}=await supabaseClient.from("tournament_stages").insert({tournament_id:tid,stage_order:Number(last?.[0]?.stage_order||0)+1,name:"Quadro personalizado",format:"single_elimination",status:"draft",config:{editor:"custom_board",version:2}}).select("id").single();
      if(error)throw error;boardStageId=data.id;
    }
    const {data:existingRows,error:existingError}=await supabaseClient.from("tournament_bracket_nodes").select("*").eq("stage_id",boardStageId).eq("bracket_side","main");
    if(existingError)throw existingError;
    bracketRows=existingRows||[];
    let mainNo=0;
    const rows=[];
    games.forEach(n=>{
      n.bracketId=n.bracketId||n.id;mainNo++;
      const incomingA=incomingFor(n.id,"A"),incomingB=incomingFor(n.id,"B");
      const current=bracketRows.find(r=>r.id===n.bracketId);
      const sourceTeam=edge=>{
        if(!edge)return null;
        const sourceNode=nodeById(edge.from);
        const sourceRow=bracketRows.find(r=>r.config?.board_node_id===edge.from||r.id===sourceNode?.bracketId||r.id===edge.from);
        if(!sourceRow?.winner_team_id)return null;
        if(edge.result==="winner")return sourceRow.winner_team_id;
        if(edge.result==="loser")return sourceRow.winner_team_id===sourceRow.team_a_id?sourceRow.team_b_id:sourceRow.team_a_id;
        return null;
      };
      const teamA=incomingA?sourceTeam(incomingA):(n.slots?.A||null);
      const teamB=incomingB?sourceTeam(incomingB):(n.slots?.B||null);
      const round=nodeRound(n.id);
      const matchNumber=games.filter(item=>nodeRound(item.id)===round).indexOf(n)+1;
      rows.push({
        id:n.bracketId,tournament_id:tid,stage_id:boardStageId,bracket_side:"main",round_number:round,match_number:matchNumber,
        team_a_id:teamA,team_b_id:teamB,
        team_a_source_node_id:incomingA&&["winner","loser"].includes(incomingA.result)?nodeById(incomingA.from)?.bracketId||incomingA.from:null,
        team_a_source_result:incomingA&&["winner","loser"].includes(incomingA.result)?incomingA.result:null,
        team_b_source_node_id:incomingB&&["winner","loser"].includes(incomingB.result)?nodeById(incomingB.from)?.bracketId||incomingB.from:null,
        team_b_source_result:incomingB&&["winner","loser"].includes(incomingB.result)?incomingB.result:null,
        status:current?.status==="completed"?"completed":teamA&&teamB?"ready":"pending",
        config:{board_node_id:n.id}
      });
    });
    groups.forEach(g=>(g.fixtures||[]).forEach(f=>{
      f.bracketId=f.bracketId||f.id;
      rows.push({id:f.bracketId,tournament_id:tid,stage_id:boardStageId,bracket_side:"groups",round_number:1,match_number:parseInt(f.id.replace(/-/g,"").slice(0,7),16),team_a_id:f.teamA,team_b_id:f.teamB,status:"ready",config:{group_node_id:g.id,round:f.round}});
    }));
    const currentBoardIds=new Set(games.map(n=>n.bracketId));
    const stale=(existingRows||[]).filter(row=>row.config?.board_node_id&&!currentBoardIds.has(row.id));
    if(stale.some(row=>row.match_id||row.status==="completed"))throw new Error("Há partidas antigas com resultados. Não removi esses registros.");
    if(stale.length){
      const {error}=await supabaseClient.from("tournament_bracket_nodes").delete().in("id",stale.map(row=>row.id));
      if(error)throw error;
    }
    if(rows.length){
      const {error}=await supabaseClient.from("tournament_bracket_nodes").upsert(rows,{onConflict:"id"});
      if(error)throw error;
    }
    for(const node of games){
      const winnerEdge=board.edges.find(e=>e.from===node.id&&e.result==="winner");
      const loserEdge=board.edges.find(e=>e.from===node.id&&e.result==="loser");
      const {error}=await supabaseClient.from("tournament_bracket_nodes").update({
        next_winner_node_id:winnerEdge?(nodeById(winnerEdge.to)?.bracketId||winnerEdge.to):null,
        next_winner_slot:winnerEdge?winnerEdge.slot:null,
        next_loser_node_id:loserEdge?(nodeById(loserEdge.to)?.bracketId||loserEdge.to):null,
        next_loser_slot:loserEdge?loserEdge.slot:null
      }).eq("id",node.bracketId);
      if(error)throw error;
    }
    const {data:refreshed,error:refreshError}=await supabaseClient.from("tournament_bracket_nodes").select("*").eq("stage_id",boardStageId);
    if(refreshError)throw refreshError;
    bracketRows=refreshed||[];
  }
  async function saveBoard(){
    if(!isAdmin||!currentUser||!supabaseClient){notify("Entre como administrador para salvar o quadro.");return;}
    if(boardBusy)return;
    boardBusy=true;$("#boardSaveButton").disabled=true;$("#boardSaveState").textContent="Salvando estrutura e conexões...";
    try{
      const usedSlots=new Set(),sourcePorts=new Set();
      for(const edge of board.edges){
        const targetKey=edge.to+":"+edge.slot,sourceKey=edge.from+":"+edge.result;
        if(usedSlots.has(targetKey)||sourcePorts.has(sourceKey))throw new Error("Cada entrada e cada saída só podem ter uma conexão.");
        usedSlots.add(targetKey);sourcePorts.add(sourceKey);
        if(!validateConnection(edge.from,edge.result,edge.to,edge.slot,true))throw new Error("Revise as conexões do chaveamento.");
      }
      const assigned=[];
      for(const n of board.nodes.filter(item=>item.type!=="group")){
        ["A","B"].forEach(slot=>{
          if(incomingFor(n.id,slot))return;
          const id=n.slots?.[slot];
          if(id){if(assigned.includes(id))throw new Error("Uma equipe não pode ocupar duas vagas iniciais.");assigned.push(id);}
        });
      }
      await syncBracketRows();
      const {error}=await supabaseClient.from("tournament_board_documents").upsert({tournament_id:tid,board_json:board,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"tournament_id"});
      if(error)throw error;
      renderBoard();
      $("#boardSaveState").textContent="Organização salva · "+new Date().toLocaleTimeString("pt-BR");
    }catch(err){$("#boardSaveState").textContent="Falha ao salvar: "+(err?.message||"erro");}
    finally{boardBusy=false;$("#boardSaveButton").disabled=false;}
  }
  function queueSave(){
    renderBoard();$("#boardSaveState").textContent="Alterações pendentes · salvando automaticamente...";
    clearTimeout(saveTimer);saveTimer=setTimeout(saveBoard,650);
  }
  async function openBoard(){
    if(!isAdmin){notify("Somente administradores podem organizar o campeonato.");return;}
    go("tournament-board");
  }
  window.ACS6.openBoard=openBoard;
  $("#boardSaveButton")?.addEventListener("click",saveBoard);
  $("#boardBackButton")?.addEventListener("click",()=>go("tournaments"));
  $("#boardAddMatchButton")?.addEventListener("click",addMatchNode);
  $("#boardClearButton")?.addEventListener("click",()=>{
    const completed=board.nodes.some(n=>{const row=rowForNode(n.id);return row?.match_id||row?.status==="completed";});
    if(completed){notify("O quadro possui resultados registrados. Remova ou ajuste apenas as partidas ainda não disputadas.");return;}
    if(!confirm("Limpar todas as partidas e conexões do quadro? As equipes voltarão à lista de disponíveis."))return;
    board={version:2,nodes:[],edges:[]};pendingOutput=null;selectedTeamId=null;queueSave();
  });
  const oldGo=go;
  go=function(page){oldGo(page);if(page==="tournament-board")loadBoard();};

})();
