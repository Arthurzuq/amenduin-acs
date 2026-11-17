/* ACS public tournament schedule — public table with inline organizer scheduling. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const tournamentId = document.documentElement.dataset.acsTournamentId || "9a865495-77c1-439f-a468-0ad8d52634b7";
  const panel = $("#tournamentPublicSchedulePanel");
  const host = $("#tournamentPublicSchedule");
  if (!panel || !host) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const ordinal = (value) => {
    const number = Number(String(value || "").replace("place_", ""));
    return Number.isFinite(number) && number > 0 ? number + "º" : String(value || "");
  };
  const statusText = (status) => ({
    ready: "Pronta", completed: "Concluída", pending: "Aguardando equipes",
    live: "Em andamento", bye: "Avanço automático", cancelled: "Cancelada"
  })[status] || "Aguardando";

  let requestVersion = 0;
  let editingMatchId = null;
  let tableData = null;
  let saving = false;

  function canManageSchedule() {
    return typeof isAdmin !== "undefined" && !!isAdmin &&
      typeof currentUser !== "undefined" && !!currentUser &&
      typeof supabaseClient !== "undefined" && !!supabaseClient;
  }

  function teamName(teamId, teams) {
    return teamId ? (teams.get(teamId)?.name || "Equipe inscrita") : "";
  }

  function nodeTitle(node, row, allMatchNodes) {
    if (node?.label && String(node.label).trim()) return String(node.label).trim();
    const index = allMatchNodes.findIndex((item) => item.id === node?.id) + 1;
    const number = row?.match_number || index || 1;
    return "Jogo " + String(number).padStart(2, "0");
  }

  function findEntry(id, entries) {
    return entries.find((entry) => entry.keys.includes(id)) || null;
  }

  function rawDependencies(schedule) {
    if (Array.isArray(schedule?.afterMatchIds)) return schedule.afterMatchIds.filter(Boolean);
    return schedule?.afterMatchId ? [schedule.afterMatchId] : [];
  }

  function normalizedDependencies(schedule, entries) {
    return [...new Set(rawDependencies(schedule).map((id) => findEntry(id, entries)?.id || id))];
  }

  function buildEntries(board, rows) {
    const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
    const matchNodes = nodes.filter((node) => node.type !== "group");
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    rows.forEach((row) => {
      if (row.config?.board_node_id) rowsById.set(row.config.board_node_id, row);
    });
    const entries = [];

    nodes.filter((node) => node.type === "group").forEach((group) => {
      (group.fixtures || []).slice().sort((a, b) => Number(a.round || 1) - Number(b.round || 1))
        .forEach((fixture, index) => {
        const id = fixture.bracketId || fixture.id;
        if (!id) return;
        entries.push({
          id,
          keys: [...new Set([id, fixture.id, fixture.bracketId].filter(Boolean))],
          label: (group.name || "Grupo") + " · Rodada " + Number(fixture.round || 1) + " · Jogo " + (index + 1),
          item: fixture,
          kind: "group"
        });
      });
    });

    matchNodes.forEach((node) => {
      const row = rowsById.get(node.bracketId || node.id) || rows.find((item) => item.config?.board_node_id === node.id) || null;
      const id = node.id;
      entries.push({
        id,
        keys: [...new Set([id, node.bracketId].filter(Boolean))],
        label: nodeTitle(node, row, matchNodes),
        item: node,
        kind: "bracket"
      });
    });
    return { entries: entries.filter((entry) => entry.id), rowsById, matchNodes };
  }

  function graphHasCycle(targetId, proposedDependencies, entries) {
    const visiting = new Set();
    const visited = new Set();

    function visit(rawId) {
      const entry = findEntry(rawId, entries);
      if (!entry) return false;
      if (visiting.has(entry.id)) return true;
      if (visited.has(entry.id)) return false;
      visiting.add(entry.id);
      const dependencies = entry.id === targetId
        ? proposedDependencies
        : rawDependencies(entry.item.schedule);
      for (const dependencyId of dependencies) {
        if (visit(dependencyId)) return true;
      }
      visiting.delete(entry.id);
      visited.add(entry.id);
      return false;
    }

    return entries.some((entry) => visit(entry.id));
  }

  function currentTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    } catch {
      return "America/Sao_Paulo";
    }
  }

  function dateTimeLocalValue(value, timeZone) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const zone = timeZone || currentTimeZone();
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(date).map((part) => [part.type, part.value]));
      return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":" + parts.minute;
    } catch {
      return "";
    }
  }

  function dateTimeLocalToISO(value, timeZone) {
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      throw new Error("Informe uma data e um horário válidos.");
    }
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
    const zone = timeZone || currentTimeZone();
    const offsetAt = (instant) => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second)) - instant;
    };
    const first = utcGuess - offsetAt(utcGuess);
    const corrected = utcGuess - offsetAt(first);
    const result = new Date(corrected);
    if (Number.isNaN(result.getTime())) throw new Error("Não foi possível interpretar a data escolhida.");
    return result.toISOString();
  }

  function formatSchedule(schedule, entries) {
    if (schedule?.mode === "fixed") {
      if (!schedule.startsAt) return "Data e horário a definir";
      const date = new Date(schedule.startsAt);
      if (Number.isNaN(date.getTime())) return "Data e horário inválidos";
      const zone = schedule.timeZone || "America/Sao_Paulo";
      try {
        return date.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          timeZone: zone, timeZoneName: "short"
        });
      } catch {
        return date.toLocaleString("pt-BR");
      }
    }
    if (schedule?.mode === "after") {
      const dependencies = normalizedDependencies(schedule, entries);
      if (!dependencies.length) return "Aguardando escolha das partidas";
      const labels = dependencies.map((id) => findEntry(id, entries)?.label || "Partida não encontrada");
      return "Após o término de " + labels.join(" e ");
    }
    return "A definir";
  }

  function dependencyOptions(entry, entries, selectedId) {
    const options = entries
      .filter((candidate) => candidate.id !== entry.id &&
        !graphHasCycle(entry.id, [candidate.id], entries))
      .map((candidate) =>
        '<option value="' + escapeHtml(candidate.id) + '" ' +
        (selectedId === candidate.id ? "selected" : "") + ">" +
        escapeHtml(candidate.label) + "</option>"
      ).join("");
    const found = selectedId && findEntry(selectedId, entries);
    const missing = selectedId && !found
      ? '<option value="' + escapeHtml(selectedId) + '" selected>Partida selecionada não encontrada</option>'
      : "";
    return '<option value="">Selecione uma partida...</option>' + missing + options;
  }

  function editorMarkup(entry, entries) {
    const schedule = entry.item.schedule || { mode: "none" };
    const mode = ["fixed", "after"].includes(schedule.mode) ? schedule.mode : "none";
    const selected = normalizedDependencies(schedule, entries);
    const count = selected.length > 1 ? 2 : 1;
    const zone = schedule.timeZone || currentTimeZone();
    const fixedDate = dateTimeLocalValue(schedule.startsAt, zone);
    return '<form class="acs-schedule-editor" data-schedule-editor data-match-id="' + escapeHtml(entry.id) + '">' +
      '<label><span>COMO DEFINIR O HORÁRIO</span><select data-editor-mode>' +
        '<option value="none" ' + (mode === "none" ? "selected" : "") + '>Ainda não definido</option>' +
        '<option value="fixed" ' + (mode === "fixed" ? "selected" : "") + '>Data e horário fixos</option>' +
        '<option value="after" ' + (mode === "after" ? "selected" : "") + '>Depender de partida(s)</option>' +
      '</select></label>' +
      '<div class="acs-schedule-mode-section" data-mode-section="fixed" ' + (mode === "fixed" ? "" : "hidden") + '>' +
        '<label><span>DATA E HORÁRIO</span><input type="datetime-local" data-fixed-datetime value="' + escapeHtml(fixedDate) + '" ' + (mode === "fixed" ? "required" : "") + '></label>' +
      '</div>' +
      '<div class="acs-schedule-mode-section" data-mode-section="after" ' + (mode === "after" ? "" : "hidden") + '>' +
        '<label><span>QUANTAS PARTIDAS PRECISAM TERMINAR?</span><select data-dependency-count>' +
          '<option value="1" ' + (count === 1 ? "selected" : "") + '>Uma partida</option>' +
          '<option value="2" ' + (count === 2 ? "selected" : "") + '>Duas partidas</option>' +
        '</select></label>' +
        '<label><span>PARTIDA 1</span><select data-dependency-index="0">' + dependencyOptions(entry, entries, selected[0] || "") + '</select></label>' +
        '<label data-dependency-wrap="2" ' + (count === 2 ? "" : "hidden") + '><span>PARTIDA 2</span><select data-dependency-index="1">' + dependencyOptions(entry, entries, selected[1] || "") + '</select></label>' +
        '<p class="acs-schedule-editor-note">O confronto será liberado somente depois que todas as partidas escolhidas terminarem.</p>' +
      '</div>' +
      '<div class="acs-schedule-editor-actions"><button class="btn btn-primary btn-small" type="submit" data-save-schedule ' + (saving ? "disabled" : "") + '>Salvar programação</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-cancel-schedule>Cancelar</button></div>' +
    '</form>';
  }

  function scheduleCell(entry, entries) {
    const editable = canManageSchedule();
    const editButton = editable
      ? '<button type="button" class="acs-schedule-edit" data-edit-schedule="' + escapeHtml(entry.id) + '">' +
          (entry.item.schedule?.mode && entry.item.schedule.mode !== "none" ? "Editar" : "Definir") + '</button>'
      : "";
    const editor = editable && editingMatchId === entry.id ? editorMarkup(entry, entries) : "";
    return '<td class="acs-schedule-cell"><div class="acs-schedule-display"><span class="acs-public-schedule-value">' +
      escapeHtml(formatSchedule(entry.item.schedule, entries)) + '</span>' + editButton + '</div>' + editor + '</td>';
  }

  function targetDescription(edge, nodes, rowsById, stagesById, allMatchNodes) {
    const target = nodes.find((node) => node.id === edge.to || node.bracketId === edge.to);
    if (!target) return "Destino não encontrado";
    if (target.type === "group") return (target.name || "Fase de grupos") + " · classificação";
    const targetRow = rowsById.get(target.bracketId || target.id);
    const stageName = targetRow?.bracket_side === "main" ? "Mata-mata" : (stagesById.get(targetRow?.stage_id) || "Mata-mata");
    const round = targetRow?.round_number ? " · Rodada " + targetRow.round_number : "";
    return stageName + round + " · " + nodeTitle(target, targetRow, allMatchNodes) + " · vaga " + edge.slot;
  }

  function sourceDescription(edge, nodes, rowsById, allMatchNodes) {
    const source = nodes.find((node) => node.id === edge.from || node.bracketId === edge.from);
    if (!source) return "resultado de outra fase";
    if (source.type === "group") return ordinal(edge.result) + " do " + (source.name || "grupo");
    const row = rowsById.get(source.bracketId || source.id);
    const round = row?.round_number ? " da Rodada " + row.round_number : "";
    return (edge.result === "loser" ? "Perdedor" : "Vencedor") + " de " + nodeTitle(source, row, allMatchNodes) + round;
  }

  function renderTable(board, rows, stages, registrations) {
    tableData = { board, rows, stages, registrations };
    const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
    const edges = Array.isArray(board?.edges) ? board.edges : [];
    const collected = buildEntries(board, rows);
    const entries = collected.entries;
    const rowsById = collected.rowsById;
    const matchNodes = collected.matchNodes;
    const stagesById = new Map(stages.map((stage) => [stage.id, stage.name]));
    const teams = new Map();
    registrations.forEach((registration) => {
      const team = registration.teams;
      if (team?.id) teams.set(team.id, team);
    });
    const teamFromId = (id) => teamName(id, teams);
    const rowForNode = (node) => rowsById.get(node.bracketId || node.id) ||
      rows.find((row) => row.config?.board_node_id === node.id) || null;
    const incomingFor = (nodeId, slot) => edges.find((edge) => edge.to === nodeId && edge.slot === slot) || null;
    const outgoingFor = (nodeId, result) => edges.find((edge) => edge.from === nodeId && edge.result === result) || null;

    const totalTerminalWinners = matchNodes.filter((node) => !outgoingFor(node.id, "winner")).length;
    const isFinalMatch = (node) => /final/i.test(String(node.label || "")) ||
      (totalTerminalWinners === 1 && !outgoingFor(node.id, "winner"));
    const outcome = (node, result, row) => {
      const edge = outgoingFor(node.id, result);
      if (edge) return "Avança para " + targetDescription(edge, nodes, rowsById, stagesById, matchNodes);
      if (result === "loser") return "Eliminado do campeonato";
      return isFinalMatch(node) ? "Conquista o campeonato" : "Próxima partida ainda não conectada";
    };
    const slotName = (node, row, slot) => {
      const teamId = slot === "A" ? row?.team_a_id : row?.team_b_id;
      if (teamId) return teamFromId(teamId);
      const edge = incomingFor(node.id, slot);
      if (edge) return "Aguardando " + sourceDescription(edge, nodes, rowsById, matchNodes).toLowerCase();
      const savedTeamId = node.slots?.[slot];
      return savedTeamId ? teamFromId(savedTeamId) : "A definir";
    };
    const statusFor = (row, teamA, teamB) => row?.status ? statusText(row.status) :
      (teamA !== "A definir" && teamB !== "A definir" ? "Pronta" : "Aguardando equipes");
    const entryFor = (id) => entries.find((entry) => entry.id === id || entry.keys.includes(id));

    const htmlRows = [];
    nodes.filter((node) => node.type === "group").forEach((group) => {
      const fixtures = (group.fixtures || []).slice()
        .sort((a, b) => Number(a.round || 1) - Number(b.round || 1));
      const groupName = group.name || "Grupo";
      const groupEdges = edges.filter((edge) => edge.from === group.id && /^place_[1-8]$/.test(edge.result || ""))
        .sort((a, b) => Number(a.result.slice(6)) - Number(b.result.slice(6)));
      const advancement = groupEdges.length
        ? groupEdges.map((edge) => ordinal(edge.result) + " → " +
          targetDescription(edge, nodes, rowsById, stagesById, matchNodes)).join(" · ")
        : "O avanço para a próxima fase ainda não foi conectado.";
      htmlRows.push('<tr class="acs-public-table-section"><th colspan="7">' +
        escapeHtml("Fase de grupos · " + groupName) +
        '<small>Avanço por classificação: ' + escapeHtml(advancement) + '</small></th></tr>');

      fixtures.forEach((fixture, index) => {
        const fixtureId = fixture.bracketId || fixture.id;
        const entry = entryFor(fixtureId);
        const row = rowsById.get(fixtureId) || rows.find((item) => item.id === fixtureId) || null;
        const teamAId = row?.team_a_id || fixture.teamA;
        const teamBId = row?.team_b_id || fixture.teamB;
        const teamA = teamFromId(teamAId) || "A definir";
        const teamB = teamFromId(teamBId) || "A definir";
        htmlRows.push('<tr>' +
          '<td>Grupo ' + escapeHtml(groupName.replace(/^Grupo\s*/i, "")) + ' · R' + Number(fixture.round || 1) + '</td>' +
          '<td>Jogo ' + String(index + 1).padStart(2, "0") + '</td>' +
          (entry ? scheduleCell(entry, entries) : '<td>A definir</td>') +
          '<td><b>' + escapeHtml(teamA) + '</b><span class="acs-public-vs"> × </span><b>' + escapeHtml(teamB) + '</b></td>' +
          '<td><span class="acs-public-outcome">Resultado contabilizado na classificação</span></td>' +
          '<td><span class="acs-public-outcome muted">Segue no grupo e disputa os jogos restantes</span></td>' +
          '<td><span class="acs-public-status ' + (row?.status === "completed" ? "done" : "") + '">' +
            escapeHtml(statusFor(row, teamA, teamB)) + '</span></td>' +
        '</tr>');
      });
      if (!fixtures.length) htmlRows.push('<tr><td colspan="7" class="acs-public-table-empty">Ainda não há confrontos neste grupo.</td></tr>');
    });

    matchNodes.map((node) => ({ node, row: rowForNode(node), entry: entryFor(node.id) }))
      .sort((a, b) => Number(a.row?.round_number || 1) - Number(b.row?.round_number || 1) ||
        Number(a.row?.match_number || 0) - Number(b.row?.match_number || 0))
      .forEach(({ node, row, entry }) => {
        const stageName = row?.bracket_side === "main" ? "Mata-mata" :
          (stagesById.get(row?.stage_id) || "Mata-mata");
        const teamA = slotName(node, row, "A") || "A definir";
        const teamB = slotName(node, row, "B") || "A definir";
        const winner = row?.winner_team_id ? teamFromId(row.winner_team_id) : null;
        htmlRows.push('<tr>' +
          '<td>' + escapeHtml(stageName) + ' · R' + Number(row?.round_number || 1) + '</td>' +
          '<td>' + escapeHtml(nodeTitle(node, row, matchNodes)) + '</td>' +
          (entry ? scheduleCell(entry, entries) : '<td>A definir</td>') +
          '<td><b class="' + (winner && row?.winner_team_id === row?.team_a_id ? "acs-public-winner" : "") + '">' +
            escapeHtml(teamA) + '</b><span class="acs-public-vs"> × </span><b class="' +
            (winner && row?.winner_team_id === row?.team_b_id ? "acs-public-winner" : "") + '">' +
            escapeHtml(teamB) + '</b>' +
            (winner ? '<small class="acs-public-result-note">Vencedor: ' + escapeHtml(winner) + '</small>' : '') + '</td>' +
          '<td><span class="acs-public-outcome win">' + escapeHtml(outcome(node, "winner", row)) + '</span></td>' +
          '<td><span class="acs-public-outcome lose">' + escapeHtml(outcome(node, "loser", row)) + '</span></td>' +
          '<td><span class="acs-public-status ' + (row?.status === "completed" ? "done" :
            row?.status === "live" ? "live" : "") + '">' +
            escapeHtml(statusFor(row, teamA, teamB)) + '</span></td>' +
        '</tr>');
      });

    host.innerHTML = htmlRows.length
      ? '<div class="acs-public-table-scroll"><table class="acs-public-schedule-table"><thead><tr>' +
        '<th>Fase / rodada</th><th>Partida</th><th>Data / horário previsto</th><th>Confronto</th>' +
        '<th>Se vencer</th><th>Se perder</th><th>Status</th>' +
        '</tr></thead><tbody>' + htmlRows.join("") + '</tbody></table></div>' +
        '<p class="acs-public-table-footnote">Quando a programação depender de duas partidas, o confronto só será liberado depois que ambas forem concluídas. A definição do horário não altera o chaveamento.</p>'
      : '<div class="market-empty">A organização ainda não adicionou jogos ao quadro.</div>';
  }

  function rerender() {
    if (!tableData) return;
    renderTable(tableData.board, tableData.rows, tableData.stages, tableData.registrations);
    updateEditorVisibility(host.querySelector("[data-schedule-editor]"));
  }

  function updateEditorVisibility(form) {
    if (!form) return;
    const mode = form.querySelector("[data-editor-mode]")?.value || "none";
    const count = Number(form.querySelector("[data-dependency-count]")?.value || 1);
    form.querySelectorAll("[data-mode-section]").forEach((section) => {
      section.hidden = section.dataset.modeSection !== mode;
    });
    const secondWrap = form.querySelector('[data-dependency-wrap="2"]');
    if (secondWrap) secondWrap.hidden = mode !== "after" || count < 2;
    const selects = [...form.querySelectorAll("[data-dependency-index]")];
    const first = selects[0]?.value || "";
    const second = selects[1]?.value || "";
    selects.forEach((select, index) => {
      [...select.options].forEach((option) => {
        if (!option.value) return;
        const other = index === 0 ? second : first;
        option.disabled = !!other && option.value === other;
      });
    });
    const datetime = form.querySelector("[data-fixed-datetime]");
    if (datetime) datetime.required = mode === "fixed";
  }

  async function saveScheduleForm(form) {
    if (saving) return;
    if (!canManageSchedule()) {
      alert("Somente administradores podem alterar a programação.");
      return;
    }
    const matchId = form.dataset.matchId;
    const mode = form.querySelector("[data-editor-mode]")?.value || "none";
    const saveButton = form.querySelector("[data-save-schedule]");
    saving = true;
    if (saveButton) saveButton.disabled = true;
    try {
      const { data: latestDocument, error: readError } = await supabaseClient
        .from("tournament_board_documents")
        .select("board_json")
        .eq("tournament_id", tournamentId)
        .maybeSingle();
      if (readError) throw readError;

      const latestBoard = latestDocument?.board_json || tableData?.board || { nodes: [], edges: [] };
      const latestEntries = buildEntries(latestBoard, tableData?.rows || []).entries;
      const target = findEntry(matchId, latestEntries);
      if (!target) throw new Error("Esta partida não existe mais. Atualize a tabela.");

      let schedule = { mode: "none" };
      if (mode === "fixed") {
        const input = form.querySelector("[data-fixed-datetime]");
        if (!input?.value) throw new Error("Informe a data e o horário da partida.");
        const timeZone = currentTimeZone();
        schedule = {
          mode: "fixed",
          startsAt: dateTimeLocalToISO(input.value, timeZone),
          timeZone
        };
      } else if (mode === "after") {
        const count = Number(form.querySelector("[data-dependency-count]")?.value || 1);
        const selected = [0, 1].slice(0, count).map((index) =>
          form.querySelector('[data-dependency-index="' + index + '"]')?.value || ""
        );
        if (selected.some((id) => !id)) throw new Error("Selecione " +
          (count === 2 ? "as duas partidas" : "a partida") + " que definirão o horário.");
        if (new Set(selected).size !== selected.length) {
          throw new Error("Escolha partidas diferentes nos dois campos.");
        }
        for (const id of selected) {
          const dependency = findEntry(id, latestEntries);
          if (!dependency) throw new Error("Uma das partidas selecionadas não existe mais. Atualize a tabela.");
          if (dependency.id === target.id) throw new Error("Uma partida não pode depender dela mesma.");
        }
        if (graphHasCycle(target.id, selected, latestEntries)) {
          throw new Error("Essa combinação criaria uma dependência circular entre partidas.");
        }
        schedule = { mode: "after", afterMatchIds: selected };
      }

      target.item.schedule = schedule;
      const { error: saveError } = await supabaseClient
        .from("tournament_board_documents")
        .upsert({
          tournament_id: tournamentId,
          board_json: latestBoard,
          updated_by: currentUser.id,
          updated_at: new Date().toISOString()
        }, { onConflict: "tournament_id" });
      if (saveError) throw saveError;

      editingMatchId = null;
      tableData.board = latestBoard;
      renderTable(tableData.board, tableData.rows, tableData.stages, tableData.registrations);
      const stamp = $("#tournamentPublicScheduleUpdated");
      if (stamp) stamp.textContent = "Atualizado em " + new Date().toLocaleString("pt-BR");
      window.dispatchEvent(new Event("acs:tournament-board-updated"));
    } catch (error) {
      alert("Não foi possível salvar a programação: " + (error?.message || "erro inesperado"));
    } finally {
      saving = false;
      const currentButton = host.querySelector("[data-save-schedule]");
      if (currentButton) currentButton.disabled = false;
    }
  }

  async function refresh() {
    const version = ++requestVersion;
    if (typeof supabaseClient === "undefined" || !supabaseClient) {
      host.innerHTML = '<div class="market-empty">Não foi possível conectar ao campeonato.</div>';
      return;
    }
    host.innerHTML = '<div class="market-empty">Carregando tabela de jogos...</div>';
    try {
      const [documentResult, nodesResult, stagesResult, registrationsResult] = await Promise.all([
        supabaseClient.from("tournament_board_documents").select("board_json,updated_at")
          .eq("tournament_id", tournamentId).maybeSingle(),
        supabaseClient.from("tournament_bracket_nodes").select("*").eq("tournament_id", tournamentId),
        supabaseClient.from("tournament_stages").select("id,name,stage_order")
          .eq("tournament_id", tournamentId).order("stage_order"),
        supabaseClient.from("tournament_registrations").select("team_id,teams(id,name,tag,logo_url)")
          .eq("tournament_id", tournamentId).eq("status", "approved")
      ]);
      if (version !== requestVersion) return;
      const failed = [documentResult, nodesResult, stagesResult, registrationsResult]
        .find((result) => result.error);
      if (failed) throw failed.error;
      const board = documentResult.data?.board_json || { nodes: [], edges: [] };
      const nodes = Array.isArray(board.nodes) ? board.nodes : [];
      if (!nodes.length) {
        panel.hidden = true;
        $(".tournament-bracket-panel")?.classList.remove("acs-public-table-replaced");
        tableData = null;
        return;
      }
      panel.hidden = false;
      $(".tournament-bracket-panel")?.classList.add("acs-public-table-replaced");
      editingMatchId = null;
      renderTable(board, nodesResult.data || [], stagesResult.data || [], registrationsResult.data || []);
      const updated = documentResult.data?.updated_at
        ? new Date(documentResult.data.updated_at).toLocaleString("pt-BR")
        : "sem horário registrado";
      const stamp = $("#tournamentPublicScheduleUpdated");
      if (stamp) stamp.textContent = "Atualizado em " + updated;
    } catch (error) {
      if (version !== requestVersion) return;
      host.innerHTML = '<div class="market-empty">Falha ao carregar a tabela: ' +
        escapeHtml(error?.message || "erro inesperado") + '</div>';
    }
  }

  host.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-schedule]");
    if (editButton) {
      editingMatchId = editButton.dataset.editSchedule;
      rerender();
      return;
    }
    const cancelButton = event.target.closest("[data-cancel-schedule]");
    if (cancelButton) {
      editingMatchId = null;
      rerender();
    }
  });

  host.addEventListener("change", (event) => {
    const form = event.target.closest("[data-schedule-editor]");
    if (!form) return;
    if (event.target.matches("[data-editor-mode], [data-dependency-count], [data-dependency-index]")) {
      updateEditorVisibility(form);
    }
  });

  host.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-schedule-editor]");
    if (!form) return;
    event.preventDefault();
    saveScheduleForm(form);
  });

  $("#refreshTournamentPublicSchedule")?.addEventListener("click", refresh);
  $("#refreshTournaments")?.addEventListener("click", () => window.setTimeout(refresh, 350));
  window.addEventListener("acs:tournament-board-updated", refresh);
  window.addEventListener("acs:auth-state-changed", refresh);
  refresh();
  window.ACS_PUBLIC_TOURNAMENT_TABLE = { refresh };
})();
