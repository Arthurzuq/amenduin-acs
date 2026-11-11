/* ACS 5.0 interface extensions. Uses the existing authenticated Supabase client and RPCs. */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const safe5 = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast5 = (m) => typeof toast === "function" ? toast(m) : alert(m);
  const tournamentId = document.documentElement.dataset.acsTournamentId || "9a865495-77c1-439f-a468-0ad8d52634b7";
  let tournament = null;
  let registrations = [];
  let tournamentStages = [];
  let tournamentNodes = [];

  // Profile creation is account-bound; one profile per account is enforced again by the DB UNIQUE constraint.
  const oldOpenForm = openForm;
  openForm = function (profile = null) {
    if (!currentUser) {
      toast5("Entre com seu e-mail para criar seu perfil.");
      $("#authModal")?.classList.add("open");
      return;
    }
    const own = players.find(p => p.userId === currentUser.id);
    if (!profile && own) {
      toast5("Sua conta já possui um perfil. Você pode editar o perfil existente.");
      if (typeof openDetail === "function") openDetail(own.id);
      return;
    }
    if (profile && profile.userId !== currentUser.id) {
      toast5("Você só pode editar o próprio perfil.");
      return;
    }
    oldOpenForm(profile);
  };
  $("#newPlayerTop")?.remove();

  // Extend the existing profile form with the customization fields already present in the database.
  const profileGrid = $("#playerForm .form-grid");
  if (profileGrid && !$("#profileCustomization")) {
    const wrap = document.createElement("div");
    wrap.id = "profileCustomization";
    wrap.className = "profile-custom-grid span-2";
    wrap.innerHTML = `
      <label class="field">URL DA FOTO DE PERFIL<input id="profileAvatarUrl" type="url" placeholder="https://..." maxlength="500"></label>
      <label class="field">MOLDURA<select id="profileFrameColor"><option value="blue">Azul</option><option value="green">Verde</option><option value="red">Vermelho</option><option value="yellow">Amarelo</option></select></label>
      <label class="field">FUNDO DO PERFIL<select id="profileBackground"><option value="black">Preto</option><option value="white">Branco</option><option value="light_orange">Laranja claro</option><option value="blue">Azul</option><option value="light_green">Verde claro</option><option value="light_red">Vermelho claro</option><option value="light_yellow">Amarelo claro</option></select></label>
      <label class="field">COR DO NOME<select id="profileNameColor"><option value="yellow">Amarelo</option><option value="white">Branco</option><option value="gray">Cinza</option></select></label>`;
    profileGrid.append(wrap);
  }
  const oldProfileOpen = openForm;
  openForm = function (profile = null) {
    oldProfileOpen(profile);
    if (!$("#profileModal")?.classList.contains("open")) return;
    $("#profileAvatarUrl").value = profile?.avatarUrl || "";
    $("#profileFrameColor").value = profile?.profileFrameColor || "blue";
    $("#profileBackground").value = profile?.profileBackground || "blue";
    $("#profileNameColor").value = profile?.profileNameColor || "white";
  };

  // Profile appearance fields are persisted atomically by the main profile submit handler.

  // Player cards reflect the saved avatar, colors and role-specific visual identity.
  const roleClass5 = role => ({AWPer:"awp",Rifler:"rifler",IGL:"igl",Lurker:"lurker",Support:"support","Entry-Fragger":"entry"})[role] || "";
  playerCard = function (p) {
    const frame = safe5(p.profileFrameColor || "blue");
    const bg = safe5(p.profileBackground || "blue");
    const name = safe5(p.profileNameColor || "white");
    const avatar = p.avatarUrl ? `<img src="${safe5(p.avatarUrl)}" alt="Foto de ${safe5(p.nickname)}" loading="lazy">` : safe5(initials(p.nickname));
    const roleClass = roleClass5(p.mainRole);
    return `<article class="player-card profile-${frame} bg-${bg}" data-open="${safe5(p.id)}"><div class="card-top"><div class="avatar">${avatar}</div><div class="card-identity"><b class="name-${name}">${safe5(p.nickname)}</b><small>${safe5(p.team || "Sem equipe")} · ${safe5(p.country || "")}</small></div><span class="rating-mini">${p.rating ?? "—"}<small>RATING AM</small></span></div><span class="role-tag ${roleClass ? `role-tag-${roleClass}` : ""}">${safe5(roleShort(p.mainRole))}</span><div class="card-stats"><div><strong>${p.kd ?? "N/A"}</strong><small>K/D</small></div><div><strong>${p.adr ?? "N/A"}</strong><small>ADR</small></div><div><strong>${p.win == null ? "N/A" : Number(p.win).toFixed(1) + "%"} </strong><small>WIN RATE</small></div></div></article>`;
  };

  // Autosave híbrido: cópia local imediata e sincronização remota por administrador.
  const draftKey = () => `acs5_match_draft_v1:${currentUser?.id || "admin"}`;
  let draftRestored = false;
  let draftRestoring = false;
  let draftSyncTimer = null;
  let draftSyncChain = Promise.resolve();
  const draftFieldIds = ["matchTeamA","matchTeamB","matchBestOf","matchMapCount","customTeamAName","customTeamBName","matchPlayedAt","matchNotes","matchBracketNode"];

  function saveMatchDraft() {
    const form = $("#adminMatchForm");
    if (!form || !isAdmin || draftRestoring) return;
    const values = [...form.querySelectorAll("input,select,textarea")].map(el => ({ value: el.value, checked: el.checked }));
    const fields = Object.fromEntries(draftFieldIds.map(id => [id, $("#"+id)?.value ?? ""]));
    const snapshot = { savedAt: new Date().toISOString(), guestCount: $("#matchGuestRows")?.querySelectorAll("[data-match-guest]").length || 0, values, fields };
    try {
      localStorage.setItem(draftKey(), JSON.stringify(snapshot));
      const label = $("#acsAutosaveState");
      if (label) label.textContent = "Rascunho salvo neste dispositivo; sincronizando com a nuvem...";
    } catch (_) {}
    if (!currentUser || !supabaseClient) return;
    const ownerId = currentUser.id;
    clearTimeout(draftSyncTimer);
    draftSyncTimer = setTimeout(() => {
      draftSyncChain = draftSyncChain.then(async () => {
        if (!currentUser || currentUser.id !== ownerId || !isAdmin) return;
        const { error } = await supabaseClient.from("match_drafts").upsert({
          owner_user_id: ownerId, draft_name: "Partida em andamento",
          payload: snapshot, current_step: 1, updated_at: new Date().toISOString()
        }, { onConflict: "owner_user_id" });
        const label = $("#acsAutosaveState");
        if (label) label.textContent = error
          ? "Rascunho local salvo; falha na nuvem: " + error.message
          : "Rascunho salvo neste dispositivo e sincronizado com a nuvem.";
      }).catch(error => {
        const label = $("#acsAutosaveState");
        if (label) label.textContent = "Rascunho local salvo; falha na nuvem: " + (error?.message || "erro inesperado");
      });
    }, 650);
  }

  async function getLatestMatchDraft() {
    let localDraft = null;
    try { localDraft = JSON.parse(localStorage.getItem(draftKey()) || localStorage.getItem("acs5_match_draft_v1") || "null"); } catch (_) {}
    let remoteDraft = null;
    if (currentUser && supabaseClient) {
      const { data, error } = await supabaseClient.from("match_drafts").select("payload,updated_at")
        .eq("owner_user_id", currentUser.id).maybeSingle();
      if (!error && data?.payload?.values?.length) remoteDraft = { ...data.payload, savedAt: data.payload.savedAt || data.updated_at };
    }
    const localTime = Date.parse(localDraft?.savedAt || "") || 0;
    const remoteTime = Date.parse(remoteDraft?.savedAt || "") || 0;
    const chosen = remoteTime > localTime ? remoteDraft : (localDraft || remoteDraft);
    if (chosen && currentUser) { try { localStorage.setItem(draftKey(), JSON.stringify(chosen)); } catch (_) {} }
    return { draft: chosen, source: remoteTime > localTime ? "nuvem" : "dispositivo" };
  }

  async function restoreMatchDraft() {
    if (draftRestored || draftRestoring || !isAdmin) return;
    const form = $("#adminMatchForm");
    if (!form || !form.querySelectorAll("input,select,textarea").length) return;
    draftRestoring = true;
    try {
      if (typeof loadTournamentMatchChoices === "function") await loadTournamentMatchChoices();
      const { draft, source } = await getLatestMatchDraft();
      if (!draft?.values?.length) { draftRestored = true; return; }
      draftFieldIds.forEach(id => {
        const el = $("#"+id);
        if (el && draft.fields && Object.prototype.hasOwnProperty.call(draft.fields,id)) el.value = draft.fields[id] ?? "";
      });
      renderMapEditors();
      renderMatchPlayerRows();
      if (typeof syncCustomTeamFields === "function") syncCustomTeamFields();
      const guestHost = $("#matchGuestRows");
      while (guestHost && guestHost.querySelectorAll("[data-match-guest]").length < Number(draft.guestCount || 0)) addGuestRow();
      const controls = [...form.querySelectorAll("input,select,textarea")];
      draft.values.forEach((item,i) => {
        if (controls[i]) { controls[i].value = item.value ?? ""; controls[i].checked = !!item.checked; }
      });
      draftRestored = true;
      const label = $("#acsAutosaveState");
      if (label) label.textContent = `Rascunho restaurado da ${source} (${draft.savedAt ? new Date(draft.savedAt).toLocaleString("pt-BR") : "data não informada"}).`;
    } catch (_) {
      draftRestored = true;
    } finally {
      draftRestoring = false;
    }
  }

  const matchForm = $("#adminMatchForm");
  if (matchForm) {
    const note = document.createElement("p");
    note.id = "acsAutosaveState";
    note.className = "acs-autosave-state";
    note.textContent = "Rascunho salvo automaticamente neste dispositivo e na nuvem.";
    matchForm.prepend(note);
    matchForm.addEventListener("input", saveMatchDraft);
    matchForm.addEventListener("change", saveMatchDraft);
    window.addEventListener("pagehide", saveMatchDraft);
  }
  const oldRefreshAdmin = refreshAdminStatus;
  refreshAdminStatus = async function () {
    await oldRefreshAdmin();
    await restoreMatchDraft();
  };
  const oldRenderMapEditors = renderMapEditors;
  renderMapEditors = function () { oldRenderMapEditors(); };
  const oldRenderMatchRows = renderMatchPlayerRows;
  renderMatchPlayerRows = function () { oldRenderMatchRows(); };

  // Public recent matches on the home page.
  async function loadHomeRecentMatches() {
    const host = $("#homeRecentMatches");
    if (!host || !supabaseClient) return;
    const { data, error } = await supabaseClient.from("matches")
      .select("id,played_at,team_a_name,team_b_name,team_a_score,team_b_score,best_of,status")
      .eq("status", "completed").order("played_at", { ascending: false }).limit(3);
    if (error) { host.innerHTML = `<div class="market-empty">Não foi possível carregar as partidas: ${safe5(error.message)}</div>`; return; }
    host.innerHTML = data?.length ? data.map(m => `<button class="match-card match-card-compact home-match-link" type="button" data-home-match="${safe5(m.id)}"><div class="match-card-top"><small>${m.played_at ? new Date(m.played_at).toLocaleDateString("pt-BR") : "Data não informada"} · MD${m.best_of || 1}</small></div><div class="match-score"><b>${safe5(m.team_a_name)}</b><strong>${m.team_a_score} : ${m.team_b_score}</strong><b>${safe5(m.team_b_name)}</b></div></button>`).join("") : '<div class="market-empty">Ainda não há partidas registradas.</div>';
    $$('[data-home-match]').forEach(btn => btn.addEventListener("click", () => {
      go("matches");
      setTimeout(() => {
        const card = document.querySelector(`[data-match-id="${btn.dataset.homeMatch}"]`);
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.classList.add("match-highlight");
      }, 120);
    }));
  }

  // Tournament registration, review, configurable stages and bracket slots.
  function statusLabel(status) {
    return ({ registration_open: "Inscrições abertas", registration_closed: "Inscrições encerradas", organizing: "Em organização", active: "Em andamento", completed: "Finalizado", cancelled: "Cancelado", planned: "Em preparação" })[status] || status;
  }
  function ownCaptainTeams() {
    const own = currentPlayerProfile();
    return own ? cloudTeams.filter(t => t.captain_player_id === own.id) : [];
  }
  async function loadTournament() {
    if (!supabaseClient) return;
    const [tRes, rRes] = await Promise.all([
      supabaseClient.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
      supabaseClient.from("tournament_registrations").select("id,tournament_id,team_id,status,team_size_snapshot,roster_snapshot,registered_at,registration_note,teams(id,name,tag,captain_player_id)").eq("tournament_id", tournamentId).order("registered_at", { ascending: true })
    ]);
    if (tRes.error || !tRes.data) { $("#tournamentMeta").textContent = "Não foi possível carregar o campeonato."; return; }
    tournament = tRes.data;
    registrations = rRes.data || [];
    $("#tournamentName").textContent = tournament.name;
    $("#tournamentStatus").textContent = statusLabel(tournament.status).toUpperCase();
    const deadline = tournament.registration_deadline ? new Date(tournament.registration_deadline).toLocaleString("pt-BR") : "Não definida";
    $("#tournamentMeta").innerHTML = `<span>Prazo: <b>${safe5(deadline)}</b></span><span>Mínimo: <b>${tournament.min_players_per_team} jogadores</b></span><span>Inscrições: <b>${registrations.length}</b></span>`;
    const select = $("#tournamentTeamSelect");
    const old = select.value;
    const captainTeams = ownCaptainTeams();
    select.innerHTML = '<option value="">Selecione uma equipe...</option>' + captainTeams.map(t => `<option value="${safe5(t.id)}">${safe5(t.name)}${t.tag ? " · " + safe5(t.tag) : ""}</option>`).join("");
    if (captainTeams.some(t => t.id === old)) select.value = old;
    const existingOwn = registrations.find(r => captainTeams.some(t => t.id === r.team_id) && ["pending", "approved"].includes(r.status));
    const closed = tournament.status !== "registration_open" || (tournament.registration_deadline && new Date(tournament.registration_deadline) < new Date());
    $("#registerTournamentButton").disabled = closed || !currentUser || !captainTeams.length || !!existingOwn;
    $("#tournamentRegisterMessage").textContent = existingOwn ? (existingOwn.status === "pending" ? "Sua inscrição está em revisão!" : "Sua equipe já está aprovada neste campeonato.") : closed ? "As inscrições estão encerradas." : !currentUser ? "Entre com sua conta para inscrever uma equipe." : !captainTeams.length ? "Somente o capitão pode inscrever uma equipe. Você ainda não é capitão de uma equipe." : "A inscrição exige uma equipe com pelo menos três jogadores.";
    $("#tournamentRegistrationCount").textContent = `${registrations.length} inscrição${registrations.length === 1 ? "" : "ões"}`;
    renderRegistrations();
    $("#tournamentAdminPanel").style.display = isAdmin ? "block" : "none";
    await loadTournamentStructure();
  }
  function renderRegistrations() {
    const host = $("#tournamentRegistrations");
    if (!registrations.length) { host.innerHTML = '<div class="market-empty">Nenhuma equipe inscrita até o momento.</div>'; return; }
    host.innerHTML = registrations.map(r => {
      const team = r.teams?.name || cloudTeams.find(t => t.id === r.team_id)?.name || "Equipe";
      const status = ({ pending: "Em revisão", approved: "Aprovada", rejected: "Recusada", withdrawn: "Retirada" })[r.status] || r.status;
      const roster = Array.isArray(r.roster_snapshot) ? r.roster_snapshot.map(p => safe5(p.nickname || p.name || "Jogador")).join(", ") : "";
      return `<div class="tournament-registration"><div><b>${safe5(team)}</b><span class="market-status">${safe5(status)}</span><small>${r.team_size_snapshot || 0} jogadores${roster ? " · " + roster : ""}</small></div>${isAdmin && r.status === "pending" ? `<div class="tournament-review-actions"><button class="btn btn-primary btn-small" data-review-registration="${safe5(r.id)}" data-review-status="approved">Aprovar</button><button class="btn btn-danger btn-small" data-review-registration="${safe5(r.id)}" data-review-status="rejected">Recusar</button></div>` : ""}</div>`;
    }).join("");
    $$('[data-review-registration]').forEach(btn => btn.addEventListener("click", async () => {
      const { error } = await supabaseClient.rpc("acs_admin_review_tournament_registration", { p_registration_id: btn.dataset.reviewRegistration, p_status: btn.dataset.reviewStatus, p_admin_note: null });
      if (error) { toast5("Não foi possível revisar a inscrição: " + error.message); return; }
      toast5(btn.dataset.reviewStatus === "approved" ? "Equipe aprovada." : "Inscrição recusada.");
      await loadTournament();
    }));
  }
  async function loadTournamentStructure() {
    const host = $("#tournamentBracket");
    const [sRes,nRes] = await Promise.all([
      supabaseClient.from("tournament_stages").select("*").eq("tournament_id",tournamentId).order("stage_order"),
      supabaseClient.from("tournament_bracket_nodes").select("*").eq("tournament_id",tournamentId).order("round_number").order("match_number")
    ]);
    if(sRes.error||nRes.error){host.innerHTML=`<div class="market-empty">Não foi possível carregar as fases: ${safe5((sRes.error||nRes.error).message)}</div>`;return;}
    tournamentStages=sRes.data||[];
    tournamentNodes=nRes.data||[];
    if(!tournamentStages.length){host.innerHTML='<div class="market-empty">O chaveamento será exibido após a organização do campeonato.</div>';await loadTournamentMatchChoices();return;}

    const approved=registrations.filter(r=>r.status==="approved").map(r=>({
      id:r.team_id,name:r.teams?.name||cloudTeams.find(t=>t.id===r.team_id)?.name||"Equipe"
    }));
    const groupStage=tournamentStages.find(stage=>stage.stage_order===1);
    const playoffStage=tournamentStages.find(stage=>stage.stage_order===2);
    const groupNodes=tournamentNodes.filter(node=>node.stage_id===groupStage?.id&&node.bracket_side==="groups");
    const groupsReady=groupNodes.length>0&&groupNodes.every(node=>node.status==="completed");
    const playoffsGenerated=!!playoffStage&&tournamentNodes.some(node=>node.stage_id===playoffStage.id&&["upper","lower","grand_final"].includes(node.bracket_side));
    const savedUpper=playoffStage?.config?.qualification_draft?.upper||[];
    const savedLower=playoffStage?.config?.qualification_draft?.lower||[];
    let classificationSaveChain=Promise.resolve();

    const stageHtml=tournamentStages.map(stage=>{
      const nodes=tournamentNodes.filter(node=>node.stage_id===stage.id);
      return `<div class="tournament-stage"><h4>${safe5(stage.name)} <small>· ${safe5(stage.format)} · ${safe5(stage.status)}</small></h4>${nodes.length?nodes.map(node=>{
        const teamA=cloudTeams.find(team=>team.id===node.team_a_id)?.name||"A definir";
        const teamB=cloudTeams.find(team=>team.id===node.team_b_id)?.name||"A definir";
        const status=({ready:"Pronto",completed:"Concluído",bye:"Avanço automático",pending:"Aguardando",live:"Em andamento"})[node.status]||node.status;
        const slot=(which,teamId,name)=>`<div class="tournament-slot ${teamId?"filled":""}" data-bracket-node="${safe5(node.id)}" data-bracket-slot="${which}">${safe5(name)}</div>`;
        return `<article class="tournament-node"><div><small>${safe5(node.bracket_side)} · Rodada ${node.round_number} · Jogo ${node.match_number} · ${safe5(status)}</small>${slot("A",node.team_a_id,teamA)}</div><div>${slot("B",node.team_b_id,teamB)}</div></article>`;
      }).join(""):'<div class="market-empty">Fase sem confrontos gerados.</div>'}</div>`;
    }).join("");

    const qualificationPanel=isAdmin&&playoffStage&&!playoffsGenerated?`<div class="tournament-stage tournament-qualification">
      <h4>Classificação manual para os playoffs</h4>
      <p class="form-note">Conclua todos os jogos da fase de grupos e classifique cada equipe aprovada em Upper ou Lower. A classificação é salva no campeonato e pode ser retomada depois de atualizar a página.</p>
      ${!groupsReady?'<p class="acs-bracket-warning">Finalize todos os confrontos da fase de grupos para liberar a geração dos playoffs.</p>':''}
      ${approved.length?approved.map(team=>{
        const value=savedUpper.includes(team.id)?"upper":savedLower.includes(team.id)?"lower":"";
        return `<label class="tournament-qualification-row"><b>${safe5(team.name)}</b><select data-qual-team="${safe5(team.id)}"><option value="" ${value===""?"selected":""}>Não classificada</option><option value="upper" ${value==="upper"?"selected":""}>Upper</option><option value="lower" ${value==="lower"?"selected":""}>Lower</option></select></label>`;
      }).join(""):'<div class="market-empty">Ainda não há equipes aprovadas.</div>'}
      <p class="form-note" id="qualificationSaveState">As alterações são salvas automaticamente.</p>
      <button class="btn btn-primary btn-small" type="button" id="createPlayoffsButton" ${approved.length<2||!groupsReady?"disabled":""}>Gerar playoffs Upper/Lower</button>
    </div>`:"";

    host.innerHTML=qualificationPanel+stageHtml;

    if(isAdmin&&playoffStage&&!playoffsGenerated){
      const saveClassificationDraft=()=>{
        const upper=[],lower=[];
        $$("[data-qual-team]").forEach(select=>{
          if(select.value==="upper")upper.push(select.dataset.qualTeam);
          else if(select.value==="lower")lower.push(select.dataset.qualTeam);
        });
        const state=$("#qualificationSaveState");
        classificationSaveChain=classificationSaveChain.then(async()=>{
          if(state)state.textContent="Salvando classificação...";
          const config={...(playoffStage.config||{}),qualification_draft:{upper,lower,updated_at:new Date().toISOString()}};
          const {error}=await supabaseClient.from("tournament_stages").update({config}).eq("id",playoffStage.id);
          if(state)state.textContent=error?"Falha ao salvar a classificação: "+error.message:"Classificação salva no campeonato.";
        }).catch(error=>{if(state)state.textContent="Falha ao salvar a classificação: "+(error?.message||"erro inesperado");});
        const button=$("#createPlayoffsButton");
        if(button)button.disabled=!groupsReady||upper.length===0||lower.length===0||upper.length+lower.length!==approved.length;
        return classificationSaveChain;
      };
      $$("[data-qual-team]").forEach(select=>select.addEventListener("change",saveClassificationDraft));
      $("#createPlayoffsButton")?.addEventListener("click",async()=>{
        await classificationSaveChain;
        const upper=[],lower=[];
        $$("[data-qual-team]").forEach(select=>{
          if(select.value==="upper")upper.push(select.dataset.qualTeam);
          else if(select.value==="lower")lower.push(select.dataset.qualTeam);
        });
        if(!groupsReady||!upper.length||!lower.length||upper.length+lower.length!==approved.length){
          toast5("Classifique todas as equipes aprovadas em Upper ou Lower.");
          return;
        }
        const button=$("#createPlayoffsButton");button.disabled=true;button.textContent="Gerando chaveamento...";
        const {data,error}=await supabaseClient.rpc("acs_admin_build_playoffs",{
          p_tournament_id:tournamentId,p_upper_team_ids:upper,p_lower_team_ids:lower
        });
        button.disabled=false;button.textContent="Gerar playoffs Upper/Lower";
        if(error){toast5("Não foi possível gerar os playoffs: "+error.message);return;}
        toast5(`Playoffs gerados: ${data?.node_count??"—"} confrontos.`);
        await loadTournament();
      });
    }
    await loadTournamentMatchChoices();
  }

  async function loadTournamentMatchChoices() {
    const select=$("#matchBracketNode");
    if(!select||!supabaseClient)return;
    const keep=select.value;
    const {data,error}=await supabaseClient.from("tournament_bracket_nodes")
      .select("id,stage_id,bracket_side,round_number,match_number,team_a_id,team_b_id,status")
      .eq("tournament_id",tournamentId).eq("status","ready")
      .order("round_number").order("match_number");
    select.dataset.tournamentId=tournamentId;
    if(error){select.innerHTML='<option value="">Partida avulsa (não vinculada)</option>';return;}
    const matches=(data||[]).filter(node=>node.team_a_id&&node.team_b_id);
    select._acsBracketNodes=matches;
    const labels=matches.map(node=>{
      const stage=tournamentStages.find(item=>item.id===node.stage_id)?.name||"Campeonato";
      const nameA=cloudTeams.find(team=>team.id===node.team_a_id)?.name||"Equipe A";
      const nameB=cloudTeams.find(team=>team.id===node.team_b_id)?.name||"Equipe B";
      return {id:node.id,label:`${stage} · ${node.bracket_side} · R${node.round_number}/J${node.match_number} · ${nameA} × ${nameB}`};
    });
    select.innerHTML='<option value="">Partida avulsa (não vinculada)</option>'+labels.map(item=>`<option value="${safe5(item.id)}">${safe5(item.label)}</option>`).join("");
    select.value=labels.some(item=>item.id===keep)?keep:"";
    if(select.dataset.acsBound!=="true"){
      select.dataset.acsBound="true";
      select.addEventListener("change",()=>{
        const node=(select._acsBracketNodes||[]).find(item=>item.id===select.value);
        if(!node)return;
        const teamA=$("#matchTeamA"),teamB=$("#matchTeamB");
        if(teamA){teamA.value=node.team_a_id;teamA.dispatchEvent(new Event("change",{bubbles:true}));}
        if(teamB){teamB.value=node.team_b_id;teamB.dispatchEvent(new Event("change",{bubbles:true}));}
        saveMatchDraft();
      });
    }
  }
  $("#registerTournamentButton")?.addEventListener("click", async () => {
    if (!currentUser || !supabaseClient) { $("#authModal")?.classList.add("open"); return; }
    const teamId = $("#tournamentTeamSelect").value;
    if (!teamId) { toast5("Selecione sua equipe."); return; }
    const team = cloudTeams.find(t => t.id === teamId);
    const members = teamMembers.filter(m => m.team_id === teamId);
    const rosterSize = members.length || (team?.captain_player_id ? 1 : 0);
    if (rosterSize < Number(tournament?.min_players_per_team || 3)) { toast5("Sua equipe precisa ter pelo menos três jogadores."); return; }
    const btn = $("#registerTournamentButton"); btn.disabled = true;
    const { error } = await supabaseClient.rpc("acs_register_tournament_team", { p_tournament_id: tournamentId });
    btn.disabled = false;
    if (error) { toast5("Não foi possível inscrever a equipe: " + error.message); return; }
    $("#tournamentRegisterMessage").textContent = "Sua inscrição está em revisão!";
    toast5("Sua inscrição está em revisão!");
    await loadTournament();
  });
  $("#organizeTournamentButton")?.addEventListener("click", async () => {
    if (!isAdmin) return;
    if (!confirm("Organizar o campeonato com as equipes aprovadas? A geração das fases será feita no Supabase.")) return;
    const { error } = await supabaseClient.rpc("acs_admin_organize_tournament", { p_tournament_id: tournamentId });
    if (error) { toast5("Não foi possível organizar o campeonato: " + error.message); return; }
    toast5("Fases e confrontos gerados.");
    await loadTournament();
  });
  $("#refreshTournaments")?.addEventListener("click", loadTournament);


  async function loadTeamMapChoiceStats() {
    const host = $("#teamRankingList");
    if (!host || !supabaseClient) return;
    const { data, error } = await supabaseClient.from("match_veto_actions").select("team_id,team_name_snapshot,action_type,map_name");
    if (error) return;
    const totals = new Map();
    (data || []).forEach(row => {
      const key = row.team_id || row.team_name_snapshot || "unknown";
      if (!totals.has(key)) totals.set(key, { name: row.team_name_snapshot || cloudTeams.find(t => t.id === row.team_id)?.name || "Equipe avulsa", picks: {}, bans: {} });
      const entry = totals.get(key);
      const bucket = row.action_type === "pick" ? entry.picks : row.action_type === "ban" ? entry.bans : null;
      if (bucket) bucket[row.map_name] = (bucket[row.map_name] || 0) + 1;
    });
    if (!totals.size) return;
    const rows = [...totals.values()].map(t => {
      const top = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1])[0];
      return { ...t, topPick: top(t.picks), topBan: top(t.bans) };
    });
    $("#acsTeamMapChoiceStats")?.remove();
    host.insertAdjacentHTML("beforeend", `<div class="detail-section" id="acsTeamMapChoiceStats"><h3>Mapas mais escolhidos e banidos</h3><div class="public-stats-table-wrap"><table class="public-stats-table"><thead><tr><th>Equipe</th><th>Mais pickado</th><th>Mais banido</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${safe5(r.name)}</b></td><td>${r.topPick?`${safe5(r.topPick[0])} · ${r.topPick[1]}`:"—"}</td><td>${r.topBan?`${safe5(r.topBan[0])} · ${r.topBan[1]}`:"—"}</td></tr>`).join("")}</tbody></table></div></div>`);
  }
  const oldLoadTeamRankings = loadTeamRankings;
  loadTeamRankings = async function () { await oldLoadTeamRankings(); await loadTeamMapChoiceStats(); };

  // Integrate new page into the existing navigation without replacing existing routing.
  const oldGo = go;
  go = function (page) {
    oldGo(page);
    if (page === "tournaments") loadTournament();
    if (page === "home") loadHomeRecentMatches();
  };
  // Correct the map pool to the seven maps specified for the ACS 5.0 ruleset.
  ACS_MAPS.splice(0, ACS_MAPS.length, "Ancient", "Anubis", "Cache", "Dust II", "Inferno", "Mirage", "Nuke");
  // Existing match cards get stable anchors for the home-page recent-match shortcuts.
  const oldLoadMatches = loadMatches;
  loadMatches = async function () {
    await oldLoadMatches();
    $$("#matchesList .match-card").forEach(card => {
      const del = card.querySelector("[data-delete-match]");
      if (del) card.dataset.matchId = del.dataset.deleteMatch;
    });
  };



  // When registered teams are selected, load their entire roster automatically.
  // The operator only sets each roster member as starter, reserve or not playing.
  const previousRosterRender = renderMatchPlayerRows;
  renderMatchPlayerRows = function () {
    previousRosterRender();
    const teamA = $("#matchTeamA")?.value;
    const teamB = $("#matchTeamB")?.value;
    if (!teamA || !teamB || teamA === "custom" || teamB === "custom") return;
    const rosterA = new Set(teamMembers.filter(m => m.team_id === teamA).map(m => m.player_id));
    const rosterB = new Set(teamMembers.filter(m => m.team_id === teamB).map(m => m.player_id));
    $$("#matchPlayerRows [data-match-player]").forEach(row => {
      const id = row.dataset.matchPlayer;
      const side = rosterA.has(id) ? "A" : rosterB.has(id) ? "B" : "";
      row.style.display = side ? "grid" : "none";
      const select = row.querySelector('[data-match-key="team_side"]');
      if (select) { select.value = side; select.disabled = !!side; }
    });
  };
  ["#matchTeamA", "#matchTeamB"].forEach(sel => $(sel)?.addEventListener("change", () => {
    syncCustomTeamFields();
    renderMatchPlayerRows();
    saveMatchDraft();
  }));

  // Unregistered teams can be named directly; existing teams remain linked by UUID.
  function syncCustomTeamFields() {
    ["A", "B"].forEach(side => {
      const select = $("#matchTeam" + side);
      const wrap = $("#customTeam" + side + "Wrap");
      if (wrap) wrap.style.display = select?.value === "custom" ? "block" : "none";
    });
  }
  $("#matchTeamA")?.addEventListener("change", syncCustomTeamFields);
  $("#matchTeamB")?.addEventListener("change", syncCustomTeamFields);

  // Guest participants are persisted as snapshots and never create player profiles.
  function addGuestRow() {
    const host = $("#matchGuestRows");
    if (!host) return;
    const count = Number($("#matchBestOf")?.value || 1) === 1 ? 1 : Number($("#matchMapCount")?.value || 3);
    const row = document.createElement("div");
    row.className = "match-player-row";
    row.dataset.matchGuest = "true";
    row.innerHTML = `<div class="match-player-name"><b>Jogador convidado</b><small>Não será criado um perfil permanente</small></div>
      <label class="field">NOME<input data-guest-name maxlength="60" required placeholder="Nickname do convidado"></label>
      <label class="field">EQUIPE<select data-match-key="team_side"><option value="">Selecione</option><option value="A">Equipe A</option><option value="B">Equipe B</option></select></label>
      <label class="field">STATUS<select data-match-key="participation_status"><option value="starter">Titular</option><option value="reserve">Reserva</option><option value="not_played">Não jogou</option></select></label>
      <div class="match-player-map-stats">${Array.from({length:count},(_,i)=>`<details class="match-map-player" ${count===1?"open":""}><summary>Mapa ${i+1} — estatísticas individuais</summary><div class="form-grid">
      <label class="field">K<input data-map-stat="${i+1}" data-stat-key="kills" type="number" min="0" value="0"></label><label class="field">D<input data-map-stat="${i+1}" data-stat-key="deaths" type="number" min="0" value="0"></label><label class="field">A<input data-map-stat="${i+1}" data-stat-key="assists" type="number" min="0" value="0"></label><label class="field">ADR<input data-map-stat="${i+1}" data-stat-key="adr" type="number" min="0" step="0.01"></label><label class="field">HS%<input data-map-stat="${i+1}" data-stat-key="headshot_pct" type="number" min="0" max="100" step="0.01"></label><label class="field">MVP<input data-map-stat="${i+1}" data-stat-key="mvps" type="number" min="0" value="0"></label><label class="field">FK<input data-map-stat="${i+1}" data-stat-key="first_kills" type="number" min="0" value="0"></label><label class="field">FD<input data-map-stat="${i+1}" data-stat-key="first_deaths" type="number" min="0" value="0"></label><label class="field">CLUTCH<input data-map-stat="${i+1}" data-stat-key="clutches_won" type="number" min="0" value="0"></label></div></details>`).join("")}</div>
      <button type="button" class="btn btn-danger btn-small" data-remove-guest>Remover convidado</button>`;
    host.append(row);
    row.querySelector("[data-remove-guest]").addEventListener("click",()=>{row.remove();saveMatchDraft();});
    row.querySelectorAll("input,select").forEach(el=>el.addEventListener("input",saveMatchDraft));
  }
  $("#addGuestPlayer")?.addEventListener("click",addGuestRow);

  // Editable veto order. The database validates action type, map pool and team ownership.
  const vetoHost = $("#matchVetoEditor");
  if (vetoHost) {
    vetoHost.innerHTML = `<div id="matchVetoRows"></div><button class="btn btn-ghost btn-small" type="button" id="addVetoAction">＋ Adicionar ação de veto</button>`;
    function addVetoAction(action="ban", team="A") {
      const row = document.createElement("div");
      row.className = "veto-row form-grid";
      row.innerHTML = `<label class="field">AÇÃO<select data-veto-key="action"><option value="ban" ${action==="ban"?"selected":""}>Ban</option><option value="pick" ${action==="pick"?"selected":""}>Pick</option><option value="decider" ${action==="decider"?"selected":""}>Decider</option></select></label>
        <label class="field">EQUIPE<select data-veto-key="team"><option value="A" ${team==="A"?"selected":""}>Equipe A</option><option value="B" ${team==="B"?"selected":""}>Equipe B</option></select></label>
        <label class="field">MAPA<select data-veto-key="map">${["Ancient","Anubis","Cache","Dust II","Inferno","Mirage","Nuke"].map(m=>`<option>${m}</option>`).join("")}</select></label>
        <label class="field">LADO INICIAL<select data-veto-key="side"><option value="">Não definido</option><option value="TR">TR</option><option value="CT">CT</option></select></label>
        <button type="button" class="btn btn-danger btn-small" data-remove-veto>Remover</button>`;
      $("#matchVetoRows").append(row);
      row.querySelector("[data-remove-veto]").addEventListener("click",()=>{row.remove();saveMatchDraft();});
      row.querySelectorAll("input,select").forEach(el=>el.addEventListener("change",saveMatchDraft));
    }
    // Common MD3 veto pattern as an editable starting point.
    [["ban","A"],["ban","B"],["pick","A"],["pick","B"],["ban","A"],["ban","B"],["decider","A"]].forEach(x=>addVetoAction(...x));
    $("#addVetoAction")?.addEventListener("click",()=>addVetoAction("ban","A"));
  }

  // Initial loading after Supabase auth has had a chance to resolve.
  loadHomeRecentMatches();
  syncCustomTeamFields();
  if (isAdmin) restoreMatchDraft();
  window.addEventListener("focus", () => { if (isAdmin) restoreMatchDraft(); });
})();
