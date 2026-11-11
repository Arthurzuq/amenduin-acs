/* ACS 5.0 — guided match entry. Loaded after app.js and acs5.js. */
(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
  const MAP_POOL = ["Ancient","Anubis","Cache","Dust II","Inferno","Mirage","Nuke"];
  let roster = {A:[],B:[]};
  let rosterTeam = {A:"",B:""};
  let guestSequence = 0;
  let renderedFormat = "";

  function notify(message) {
    if (typeof toast === "function") toast(message);
    else window.alert(message);
  }
  function teamId(side) { return $("#matchTeam"+side)?.value || ""; }
  function teamName(side) {
    const id = teamId(side);
    if (id === "custom") return $("#customTeam"+side+"Name")?.value.trim() || "Equipe "+side;
    if (!id) return "Equipe "+side;
    return (window.cloudTeams || []).find(team=>team.id===id)?.name
      || $("#matchTeam"+side)?.selectedOptions?.[0]?.textContent || "Equipe "+side;
  }
  function captureControls() {
    const values = {};
    $$("#adminMatchForm [data-draft-key]").forEach(el=>{
      values[el.dataset.draftKey] = {value:el.value,checked:!!el.checked};
    });
    return values;
  }
  function restoreControls(values) {
    if (!values) return;
    $$("#adminMatchForm [data-draft-key]").forEach(el=>{
      const value = values[el.dataset.draftKey];
      if (!value) return;
      if (el.type === "checkbox") el.checked = !!value.checked;
      else if (value.value !== undefined) el.value = value.value ?? "";
    });
  }
  function syncCustomNames() {
    ["A","B"].forEach(side=>{
      const wrap = $("#customTeam"+side+"Wrap");
      if (wrap) wrap.style.display = teamId(side)==="custom" ? "flex" : "none";
    });
  }
  function newRosterPlayer(player) {
    return {
      key:"player-"+player.id, playerId:player.id, name:player.nickname,
      role:player.mainRole || "", guest:false, selected:false
    };
  }
  function loadRosterForTeam(side, force=false) {
    const selectedTeam = teamId(side);
    if (!force && rosterTeam[side] === selectedTeam) return;
    const previous = new Map((roster[side]||[]).map(player=>[player.key,player]));
    rosterTeam[side] = selectedTeam;
    if (selectedTeam && selectedTeam !== "custom") {
      const memberIds = (window.teamMembers||[])
        .filter(member=>member.team_id===selectedTeam).map(member=>member.player_id);
      roster[side] = memberIds.map(id=>{
        const player = (window.players||[]).find(item=>item.id===id);
        if (!player) return null;
        const row = newRosterPlayer(player);
        row.selected = !!previous.get(row.key)?.selected;
        return row;
      }).filter(Boolean);
    } else {
      roster[side] = selectedTeam === "custom" ? [] : [];
    }
  }
  function selectedRoster(side) { return roster[side].filter(player=>player.selected); }
  function allRosterPlayerIds() {
    return [...roster.A,...roster.B].filter(player=>!player.guest).map(player=>player.playerId);
  }

  function renderRosterEditor() {
    const host = $("#matchRosterEditor");
    if (!host) return;
    loadRosterForTeam("A");
    loadRosterForTeam("B");
    const selectedIds = allRosterPlayerIds();
    const sideCard = side => {
      const playersOnSide = roster[side] || [];
      const otherSideIds = [...roster[side==="A"?"B":"A"]]
        .filter(player=>!player.guest).map(player=>player.playerId);
      const available = (window.players||[]).filter(player=>
        !playersOnSide.some(row=>row.playerId===player.id) && !otherSideIds.includes(player.id)
      );
      const registered = teamId(side) && teamId(side)!=="custom";
      return `<article class="match-roster-side match-roster-${side.toLowerCase()}">
        <header class="match-roster-head">
          <div><span class="eyebrow">EQUIPE ${side}</span><h5>${esc(teamName(side))}</h5>
          <small>${registered?"Elenco da equipe cadastrado":"Equipe avulsa · monte a escalação"}</small></div>
          <span class="match-roster-count">${playersOnSide.filter(player=>player.selected).length} selecionados</span>
        </header>
        <div class="match-roster-add-row">
          <label class="field">ADICIONAR JOGADOR CADASTRADO
            <select data-add-player-select="${side}"><option value="">Escolha um jogador...</option>
              ${available.map(player=>`<option value="${esc(player.id)}">${esc(player.nickname)} · ${esc(player.mainRole||"Sem função")}</option>`).join("")}
            </select>
          </label>
          <button type="button" class="btn btn-ghost btn-small" data-add-player="${side}">Adicionar</button>
        </div>
        <div class="match-roster-add-row guest-add-row">
          <label class="field">JOGADOR CONVIDADO
            <input type="text" maxlength="60" placeholder="Nickname sem perfil cadastrado" data-add-guest-input="${side}">
          </label>
          <button type="button" class="btn btn-ghost btn-small" data-add-guest="${side}">Adicionar convidado</button>
        </div>
        <div class="match-roster-list">
          ${playersOnSide.length ? playersOnSide.map(player=>`<label class="match-roster-person">
            <input type="checkbox" data-roster-choice="${side}" data-roster-key="${esc(player.key)}"
              data-draft-key="roster:${side}:${esc(player.key)}" ${player.selected?"checked":""}>
            <span class="match-roster-person-name"><b>${esc(player.name)}</b><small>${player.guest?"CONVIDADO":esc(player.role||"JOGADOR CADASTRADO")}</small></span>
            <button type="button" class="match-roster-remove" data-remove-player="${side}" data-roster-key="${esc(player.key)}" aria-label="Remover ${esc(player.name)}">×</button>
          </label>`).join("") : '<div class="match-empty-state compact">Nenhum jogador adicionado a esta equipe.</div>'}
        </div>
        <p class="match-roster-footnote">Marque os participantes uma vez. Eles serão incluídos automaticamente em todos os mapas.</p>
      </article>`;
    };
    host.innerHTML = sideCard("A")+sideCard("B");
  }

  function vetoTemplate(format) {
    const row=(action,side)=>({action,side,map:""});
    if (format===1) return [row("ban","A"),row("ban","B"),row("ban","A"),row("ban","B"),row("ban","A"),row("ban","B")];
    if (format===3) return [row("ban","A"),row("ban","B"),row("pick","A"),row("pick","B"),row("ban","A"),row("ban","B")];
    if (format===5) return [row("ban","A"),row("ban","B"),row("pick","A"),row("pick","B"),row("pick","A"),row("pick","B")];
    return [];
  }
  function renderVetoEditor(force=false) {
    const host = $("#matchVetoEditor");
    if (!host) return;
    const format = Number($("#matchBestOf")?.value || 0);
    if (!format) {
      host.innerHTML = '<div class="match-empty-state">Escolha MD1, MD3 ou MD5 para montar a sequência de veto.</div>';
      renderedFormat="";
      renderVetoSummary();
      return;
    }
    if (!force && renderedFormat===String(format) && $$(".match-veto-row",host).length===6) return;
    const oldValues = captureControls();
    const rows = vetoTemplate(format);
    host.innerHTML = `<div class="match-veto-help">
      <b>${format===1?"MD1 · seis bans e um decider":format===3?"MD3 · dois picks, quatro bans e um decider":"MD5 · quatro picks, dois bans e um decider"}</b>
      <span>O último mapa que sobrar no pool será o decider automático.</span>
    </div><div class="match-veto-list">
      ${rows.map((row,index)=>`<div class="match-veto-row">
        <span class="match-veto-order">${String(index+1).padStart(2,"0")}</span>
        <label class="field">AÇÃO
          <select data-veto-action data-draft-key="veto:${index}:action">
            <option value="ban" ${row.action==="ban"?"selected":""}>Ban</option>
            <option value="pick" ${row.action==="pick"?"selected":""}>Pick</option>
          </select>
        </label>
        <label class="field">EQUIPE
          <select data-veto-team data-draft-key="veto:${index}:team">
            <option value="A" ${row.side==="A"?"selected":""}>Equipe A</option>
            <option value="B" ${row.side==="B"?"selected":""}>Equipe B</option>
          </select>
        </label>
        <label class="field veto-map-field">MAPA
          <select data-veto-map data-draft-key="veto:${index}:map">
            <option value="">Selecione o mapa...</option>
            ${MAP_POOL.map(map=>`<option value="${esc(map)}">${esc(map)}</option>`).join("")}
          </select>
        </label>
      </div>`).join("")}
    </div><div class="match-decider-preview" id="matchDeciderPreview"></div>`;
    renderedFormat=String(format);
    restoreControls(oldValues);
    refreshVetoMapOptions();
    renderVetoSummary();
  }
  function refreshVetoMapOptions() {
    const rows = $$("#matchVetoEditor .match-veto-row");
    const values = rows.map(row=>row.querySelector("[data-veto-map]")?.value||"");
    rows.forEach((row,index)=>{
      const select=row.querySelector("[data-veto-map]");
      if (!select) return;
      const used=values.filter((value,i)=>i!==index&&value);
      [...select.options].forEach(option=>{
        if (!option.value) return;
        option.disabled=used.includes(option.value);
      });
    });
  }
  function readVeto() {
    const format=Number($("#matchBestOf")?.value||0);
    const rows=$$("#matchVetoEditor .match-veto-row").map((row,index)=>({
      action_type:row.querySelector("[data-veto-action]")?.value||"",
      team_side:row.querySelector("[data-veto-team]")?.value||"",
      map_name:row.querySelector("[data-veto-map]")?.value||"",
      sequence_no:index+1
    }));
    if (![1,3,5].includes(format)) return {rows,error:"Selecione MD1, MD3 ou MD5.",decider:null,picks:[]};
    if (rows.length!==6 || rows.some(row=>!row.map_name)) return {rows,error:"Escolha um mapa para cada ação do veto.",decider:null,picks:[]};
    const chosen=rows.map(row=>row.map_name);
    if (new Set(chosen).size!==chosen.length) return {rows,error:"Um mapa não pode aparecer duas vezes no veto.",decider:null,picks:[]};
    const pickCount=rows.filter(row=>row.action_type==="pick").length;
    const banCount=rows.filter(row=>row.action_type==="ban").length;
    const expectedPicks=format===1?0:format===3?2:4;
    if (pickCount!==expectedPicks||banCount!==6-expectedPicks) {
      return {rows,error:"A quantidade de picks e bans não corresponde ao formato.",decider:null,picks:[]};
    }
    const remaining=MAP_POOL.filter(map=>!chosen.includes(map));
    if (remaining.length!==1) return {rows,error:"O veto deve deixar exatamente um mapa para o decider.",decider:null,picks:[]};
    return {rows,error:null,decider:remaining[0],picks:rows.filter(row=>row.action_type==="pick")};
  }
  function renderVetoSummary() {
    const host=$("#matchVetoSummary");
    if (!host) return;
    const result=readVeto();
    if (result.error) {
      host.innerHTML=`<span class="match-veto-status incomplete">◷ ${esc(result.error)}</span>`;
      return;
    }
    host.innerHTML=`<span class="match-veto-status complete">✓ Veto completo</span>
      <span class="match-veto-decider">Decider: <b>${esc(result.decider)}</b></span>`;
  }
  function mapPlan() {
    const veto=readVeto();
    if (veto.error) return {error:veto.error,veto,maps:[]};
    return {
      error:null,veto,
      maps:[...veto.picks.map(row=>({name:row.map_name,source:"Pick"})),{name:veto.decider,source:"Decider"}]
    };
  }
  function readMapCard(card) {
    const get=key=>card.querySelector(`[data-map-key="${key}"]`)?.value ?? "";
    const number=key=>Number(get(key)||0);
    return {
      map_name:card.dataset.mapName,
      team_a_start_side:get("team_a_start_side"),
      a_first_half:number("a_first_half"),b_first_half:number("b_first_half"),
      a_second_half:number("a_second_half"),b_second_half:number("b_second_half"),
      a_ot_tr:number("a_ot_tr"),a_ot_ct:number("a_ot_ct"),
      b_ot_tr:number("b_ot_tr"),b_ot_ct:number("b_ot_ct")
    };
  }
  function scorePreview(card) {
    const value=key=>Number(card.querySelector(`[data-map-key="${key}"]`)?.value||0);
    const a=value("a_first_half")+value("a_second_half")+value("a_ot_tr")+value("a_ot_ct");
    const b=value("b_first_half")+value("b_second_half")+value("b_ot_tr")+value("b_ot_ct");
    const target=$("[data-map-preview]",card);
    if (target) target.innerHTML=`Placar final <b>${a} : ${b}</b>`;
  }
  function updateScorePreviews(){$$("#matchMapsEditor [data-map-card]").forEach(scorePreview);}

  function renderMapTables() {
    const host=$("#matchMapsEditor");
    if (!host) return;
    const previous=captureControls();
    const plan=mapPlan();
    const sideA=selectedRoster("A"),sideB=selectedRoster("B");
    if (plan.error) {
      host.innerHTML=`<div class="match-empty-state">Complete o veto acima para gerar uma tabela por mapa.<small>${esc(plan.error)}</small></div>`;
      renderVetoSummary();
      return;
    }
    if (!sideA.length || !sideB.length) {
      host.innerHTML='<div class="match-empty-state">Selecione ao menos um jogador de cada equipe na etapa de elencos. As tabelas serão preenchidas automaticamente.</div>';
      renderVetoSummary();
      return;
    }
    const statInput=(map,player,side,key,label,type="number",attrs="")=>
      `<td><input type="${type}" ${attrs} data-map-stat data-stat-key="${key}" data-map-name="${esc(map)}"
        data-player-key="${esc(player.key)}" data-player-side="${side}"
        data-draft-key="stat:${esc(map)}:${esc(player.key)}:${key}" aria-label="${label} de ${esc(player.name)}"></td>`;
    const teamTable=(map,side,list)=>{
      const rows=list.map(player=>`<tr>
        <td class="match-stat-player"><b>${esc(player.name)}</b><small>${player.guest?"CONVIDADO":"JOGADOR"}</small></td>
        ${statInput(map,player,side,"kills","Kills","number",'min="0" max="300" value="0"')}
        ${statInput(map,player,side,"deaths","Deaths","number",'min="0" max="300" value="0"')}
        ${statInput(map,player,side,"assists","Assists","number",'min="0" max="300" value="0"')}
        ${statInput(map,player,side,"adr","ADR","number",'min="0" max="500" step="0.01" placeholder="—"')}
        ${statInput(map,player,side,"mvps","MVP","number",'min="0" max="10" value="0"')}
        ${statInput(map,player,side,"headshot_pct","HS%","number",'min="0" max="100" step="0.01" placeholder="—"')}
      </tr>`).join("");
      return `<section class="match-map-team-table">
        <header class="match-map-team-heading"><b>${esc(teamName(side))}</b><span>Equipe ${side}</span></header>
        <div class="match-map-table-scroll"><table class="match-map-stats-table">
          <thead><tr><th>JOGADOR</th><th>K</th><th>D</th><th>A</th><th>ADR</th><th>MVP</th><th>HS%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;
    };
    host.innerHTML=plan.maps.map((map,index)=>{
      const number=index+1;
      return `<article class="match-map-card" data-map-card data-map-name="${esc(map.name)}" data-map-number="${number}">
        <header class="match-map-card-head">
          <div><span class="eyebrow">MAPA ${number} · ${esc(map.source.toUpperCase())}</span><h5>${esc(map.name)}</h5></div>
          <label class="match-map-played"><input type="checkbox" checked data-map-played data-draft-key="map:${esc(map.name)}:played"> Disputado</label>
        </header>
        <fieldset class="match-map-fields">
          <div class="match-map-scoreboard">
            <div class="match-map-result-row">
              <label class="field">LADO INICIAL DA EQUIPE A
                <select data-map-key="team_a_start_side" data-draft-key="map:${esc(map.name)}:team_a_start_side">
                  <option value="TR">TR</option><option value="CT">CT</option>
                </select>
              </label>
              <div class="match-map-score-preview" data-map-preview>Placar final <b>— : —</b></div>
            </div>
            <div class="match-round-grid">
              <div class="match-round-label"><span>1º TEMPO</span><small>até 12 rounds</small></div>
              <div class="match-round-input">
                <label class="field">${esc(teamName("A"))}<input data-map-key="a_first_half" type="number" min="0" max="12" required placeholder="Rounds" data-draft-key="map:${esc(map.name)}:a_first_half"></label>
                <label class="field">${esc(teamName("B"))}<input data-map-key="b_first_half" type="number" min="0" max="12" required placeholder="Rounds" data-draft-key="map:${esc(map.name)}:b_first_half"></label>
              </div>
              <div class="match-round-label"><span>2º TEMPO</span><small>após a troca de lados</small></div>
              <div class="match-round-input">
                <label class="field">${esc(teamName("A"))}<input data-map-key="a_second_half" type="number" min="0" max="12" required placeholder="Rounds" data-draft-key="map:${esc(map.name)}:a_second_half"></label>
                <label class="field">${esc(teamName("B"))}<input data-map-key="b_second_half" type="number" min="0" max="12" required placeholder="Rounds" data-draft-key="map:${esc(map.name)}:b_second_half"></label>
              </div>
            </div>
            <details class="match-overtime"><summary>Prorrogação MR3 <small>somente em 12–12</small></summary>
              <div class="match-overtime-grid">
                <label class="field">${esc(teamName("A"))} · rounds TR<input data-map-key="a_ot_tr" type="number" min="0" value="0" data-draft-key="map:${esc(map.name)}:a_ot_tr"></label>
                <label class="field">${esc(teamName("A"))} · rounds CT<input data-map-key="a_ot_ct" type="number" min="0" value="0" data-draft-key="map:${esc(map.name)}:a_ot_ct"></label>
                <label class="field">${esc(teamName("B"))} · rounds TR<input data-map-key="b_ot_tr" type="number" min="0" value="0" data-draft-key="map:${esc(map.name)}:b_ot_tr"></label>
                <label class="field">${esc(teamName("B"))} · rounds CT<input data-map-key="b_ot_ct" type="number" min="0" value="0" data-draft-key="map:${esc(map.name)}:b_ot_ct"></label>
              </div>
            </details>
          </div>
          <div class="match-map-team-tables">
            ${teamTable(map.name,"A",sideA)}
            ${teamTable(map.name,"B",sideB)}
          </div>
        </fieldset>
      </article>`;
    }).join("");
    restoreControls(previous);
    $$("#matchMapsEditor [data-map-played]").forEach(toggle=>{
      const card=toggle.closest("[data-map-card]");
      const fieldset=$(".match-map-fields",card);
      if (fieldset) fieldset.disabled=!toggle.checked;
      card?.classList.toggle("not-played",!toggle.checked);
    });
    updateScorePreviews();
    renderVetoSummary();
  }

  function renderAll() {
    syncCustomNames();
    loadRosterForTeam("A");
    loadRosterForTeam("B");
    renderVetoEditor(true);
    renderRosterEditor();
    renderMapTables();
  }

  function addPlayer(side,player) {
    if (!player) return;
    if ([...roster.A,...roster.B].some(row=>row.playerId===player.id)) {
      notify("Esse jogador já está na escalação de uma das equipes.");
      return;
    }
    roster[side].push(newRosterPlayer(player));
    renderRosterEditor();
    renderMapTables();
  }
  function addGuest(side,name) {
    const nickname=String(name||"").trim();
    if (!nickname) { notify("Informe o nickname do jogador convidado."); return; }
    if (roster[side].some(player=>player.guest&&player.name.toLowerCase()===nickname.toLowerCase())) {
      notify("Esse convidado já foi adicionado a esta equipe.");
      return;
    }
    roster[side].push({
      key:"guest-"+side+"-"+(++guestSequence),playerId:null,name:nickname,
      role:"",guest:true,selected:false
    });
    const field=$(`[data-add-guest-input="${side}"]`);
    if (field) field.value="";
    renderRosterEditor();
    renderMapTables();
  }
  function rosterChanged(side,key,selected) {
    const player=roster[side].find(row=>row.key===key);
    if (player) player.selected=!!selected;
    renderRosterEditor();
    renderMapTables();
  }

  function validateScore(map) {
    const first=map.a_first_half+map.b_first_half;
    const second=map.a_second_half+map.b_second_half;
    if ([map.a_first_half,map.b_first_half,map.a_second_half,map.b_second_half].some(v=>v<0||v>12)) {
      return "Rounds por tempo devem ficar entre 0 e 12.";
    }
    if (first!==12) return "O 1º tempo precisa somar exatamente 12 rounds.";
    if (second>12) return "O 2º tempo não pode ultrapassar 12 rounds.";
    const aReg=map.a_first_half+map.a_second_half;
    const bReg=map.b_first_half+map.b_second_half;
    const ot=map.a_ot_tr+map.a_ot_ct+map.b_ot_tr+map.b_ot_ct;
    if (Math.max(aReg,bReg)<13 && !(aReg===12&&bReg===12)) {
      return "O placar regulamentar deve chegar a 13 ou terminar em 12–12.";
    }
    if (aReg===12&&bReg===12) {
      if (!ot || ot%6!==0 || map.a_ot_tr+map.a_ot_ct===map.b_ot_tr+map.b_ot_ct) {
        return "No 12–12, registre a prorrogação MR3 até existir um vencedor.";
      }
    } else if (ot>0) return "Só preencha prorrogação quando o tempo regulamentar terminar em 12–12.";
    if (aReg+map.a_ot_tr+map.a_ot_ct===bReg+map.b_ot_tr+map.b_ot_ct) return "O mapa ainda está empatado.";
    return null;
  }

  function buildPlayerStats(playedMaps) {
    const cards=new Map($$("#matchMapsEditor [data-map-card]").map(card=>[card.dataset.mapName,card]));
    const rows=[];
    ["A","B"].forEach(side=>{
      selectedRoster(side).forEach(player=>{
        const mapStats=playedMaps.map((map,index)=>{
          const card=cards.get(map.map_name);
          const inputs=$$("[data-map-stat]",card).filter(input=>
            input.dataset.playerKey===player.key && input.dataset.playerSide===side
          );
          const values={map_number:index+1};
          inputs.forEach(input=>{
            const key=input.dataset.statKey;
            values[key]=input.value===""?null:Number(input.value);
          });
          for (const key of ["kills","deaths","assists","mvps"]) values[key]??=0;
          return values;
        });
        const sum=key=>mapStats.reduce((total,map)=>total+(Number(map[key])||0),0);
        const average=key=>{
          const vals=mapStats.map(map=>map[key]).filter(value=>value!==null&&value!==undefined);
          return vals.length?vals.reduce((total,value)=>total+Number(value),0)/vals.length:null;
        };
        rows.push({
          player_id:player.guest?null:player.playerId,
          player_name:player.guest?player.name:null,
          team_side:side,participation_status:"starter",
          kills:sum("kills"),deaths:sum("deaths"),assists:sum("assists"),
          adr:average("adr"),headshot_pct:average("headshot_pct"),mvps:sum("mvps"),
          first_kills:0,first_deaths:0,clutches_won:0,map_stats:mapStats
        });
      });
    });
    return rows;
  }

  async function submitMatch() {
    if (!window.supabaseClient || !window.isAdmin) {
      notify("Somente administradores podem registrar partidas."); return;
    }
    const teamA=teamId("A"),teamB=teamId("B"),bestOf=Number($("#matchBestOf")?.value);
    if (!teamA||!teamB||teamA===teamB) { notify("Selecione duas equipes diferentes."); return; }
    if (![1,3,5].includes(bestOf)) { notify("Escolha MD1, MD3 ou MD5."); return; }
    if (teamA==="custom"&&!$("#customTeamAName")?.value.trim() || teamB==="custom"&&!$("#customTeamBName")?.value.trim()) {
      notify("Informe o nome das equipes avulsas."); return;
    }
    const veto=readVeto();
    if (veto.error) { notify(veto.error); return; }
    const cards=$$("#matchMapsEditor [data-map-card]");
    const playedCards=cards.filter(card=>card.querySelector("[data-map-played]")?.checked);
    if (playedCards.length< (bestOf===1?1:bestOf===3?2:3) || playedCards.length>bestOf) {
      notify(bestOf===1?"MD1 precisa ter um mapa disputado.":`Uma série MD${bestOf} precisa ter entre ${bestOf===3?2:3} e ${bestOf} mapas disputados.`);
      return;
    }
    const maps=playedCards.map(readMapCard);
    for (const map of maps) {
      const error=validateScore(map);
      if (error) { notify(map.map_name+": "+error); return; }
    }
    if (!selectedRoster("A").length||!selectedRoster("B").length) {
      notify("Selecione ao menos um jogador de cada equipe."); return;
    }
    const playerStats=buildPlayerStats(maps);
    if (!playerStats.length) { notify("Nenhum jogador foi selecionado para a série."); return; }

    let winsA=0,winsB=0;
    maps.forEach(map=>{
      const a=map.a_first_half+map.a_second_half+map.a_ot_tr+map.a_ot_ct;
      const b=map.b_first_half+map.b_second_half+map.b_ot_tr+map.b_ot_ct;
      if (a>b) winsA++; else winsB++;
    });
    if (Math.max(winsA,winsB)<(bestOf===1?1:bestOf===3?2:3)) {
      notify("Os mapas informados ainda não definem um vencedor da série."); return;
    }

    const button=$("#saveMatchButton");
    if (button) { button.disabled=true;button.textContent="Salvando série..."; }
    const vetoActions=[
      ...veto.rows.map(row=>({
        action_type:row.action_type,map_name:row.map_name,
        team_id:row.team_side==="A"?(teamA==="custom"?null:teamA):(teamB==="custom"?null:teamB),
        team_name:teamName(row.team_side),starting_side:null
      })),
      {action_type:"decider",map_name:veto.decider,team_id:null,team_name:"Decider",starting_side:null}
    ];
    const bracket=$("#matchBracketNode");
    const match={
      tournament_id:bracket?.value?(bracket.dataset.tournamentId||null):null,
      bracket_node_id:bracket?.value||null,
      team_a_id:teamA==="custom"?null:teamA,
      team_b_id:teamB==="custom"?null:teamB,
      team_a_name:teamA==="custom"?$("#customTeamAName").value.trim():null,
      team_b_name:teamB==="custom"?$("#customTeamBName").value.trim():null,
      best_of:bestOf,played_at:$("#matchPlayedAt")?.value?new Date($("#matchPlayedAt").value).toISOString():null,
      notes:$("#matchNotes")?.value.trim()||null,veto_actions:vetoActions
    };
    try {
      const {data,error}=await window.supabaseClient.rpc("acs_admin_record_series",{
        p_match:match,p_maps:maps,p_player_stats:playerStats
      });
      if (error) throw error;
      if (typeof window.clearACS5MatchDraft==="function") {
        try { await window.clearACS5MatchDraft(); } catch (clearError) {
          notify("A partida foi salva, mas o rascunho antigo não pôde ser removido: "+clearError.message);
        }
      }
      notify("Série registrada. Estatísticas, mapa e veto salvos.");
      $("#adminMatchForm").reset();
      roster={A:[],B:[]};rosterTeam={A:"",B:""};renderedFormat="";
      renderAll();
      if (typeof loadCloudPlayers==="function") await loadCloudPlayers();
      if (typeof loadMatches==="function") await loadMatches();
      if (typeof loadTeamsData==="function") await loadTeamsData();
      if (typeof renderAdminPanel==="function") renderAdminPanel();
    } catch (error) {
      notify("Não foi possível registrar a série: "+(error?.message||"erro inesperado"));
    } finally {
      if (button) {button.disabled=false;button.textContent="Salvar partida e atualizar estatísticas";}
    }
  }

  // Expose a compact interface to the autosave layer in acs5.js.
  window.ACS5_MATCH_ENTRY={
    serializeDraft:()=>({roster,rosterTeam,guestSequence,renderedFormat}),
    restoreDraft:data=>{
      if (!data) return;
      if (data.roster && Array.isArray(data.roster.A)&&Array.isArray(data.roster.B)) roster=data.roster;
      if (data.rosterTeam) rosterTeam=data.rosterTeam;
      guestSequence=Number(data.guestSequence)||0;
      renderedFormat=data.renderedFormat||"";
    },
    renderAll,
    renderVetoEditor,
    renderRosterEditor,
    renderMapTables,
    submit:submitMatch,
    getState:()=>({roster,rosterTeam})
  };
  window.renderMatchPlayerRows=renderRosterEditor;
  window.renderMapEditors=renderMapTables;

  const form=$("#adminMatchForm");
  if (form) {
    form.addEventListener("change",event=>{
      const target=event.target;
      if (target.matches("#matchBestOf")) {
        renderedFormat="";
        renderVetoEditor(true);renderMapTables();return;
      }
      if (target.matches("#matchTeamA,#matchTeamB")) {
        const side=target.id.endsWith("A")?"A":"B";
        rosterTeam[side]="";
        loadRosterForTeam(side,true);
        syncCustomNames();renderRosterEditor();renderMapTables();return;
      }
      if (target.matches("[data-veto-action],[data-veto-team]")) { renderVetoSummary();return; }
      if (target.matches("[data-veto-map]")) { refreshVetoMapOptions();renderMapTables();return; }
      if (target.matches("[data-roster-choice]")) {
        const player=roster[target.dataset.rosterChoice].find(row=>row.key===target.dataset.rosterKey);
        if (player) player.selected=target.checked;
        renderRosterEditor();renderMapTables();return;
      }
      if (target.matches("[data-map-played]")) {
        const card=target.closest("[data-map-card]");
        const fieldset=$(".match-map-fields",card);
        if (fieldset) fieldset.disabled=!target.checked;
        card?.classList.toggle("not-played",!target.checked);
      }
    });
    form.addEventListener("input",event=>{
      if (event.target.matches("[data-map-key]")) scorePreview(event.target.closest("[data-map-card]"));
      if (event.target.matches("[data-add-guest-input]")) return;
      if (event.target.matches("[data-veto-map]")) refreshVetoMapOptions();
    });
    form.addEventListener("click",event=>{
      const addPlayerButton=event.target.closest("[data-add-player]");
      if (addPlayerButton) {
        const side=addPlayerButton.dataset.addPlayer;
        const id=$(`[data-add-player-select="${side}"]`)?.value;
        const player=(window.players||[]).find(item=>item.id===id);
        if (!player) { notify("Escolha um jogador cadastrado.");return; }
        addPlayer(side,player);return;
      }
      const addGuestButton=event.target.closest("[data-add-guest]");
      if (addGuestButton) {
        const side=addGuestButton.dataset.addGuest;
        addGuest(side,$(`[data-add-guest-input="${side}"]`)?.value);return;
      }
      const removeButton=event.target.closest("[data-remove-player]");
      if (removeButton) {
        const side=removeButton.dataset.removePlayer,key=removeButton.dataset.rosterKey;
        roster[side]=roster[side].filter(player=>player.key!==key);
        renderRosterEditor();renderMapTables();
      }
    });
  }

  renderAll();
})();
